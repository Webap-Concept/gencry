// lib/modules/prices/sources/coingecko.ts
// Adapter CoinGecko. Supporta:
//  - Demo/Free tier (default): https://api.coingecko.com/api/v3, no auth
//  - Pro tier (configurato dall'admin): https://pro-api.coingecko.com/api/v3
//    con header `x-cg-pro-api-key: <api_key>`
//
// L'endpoint usato è risolto al volo da `getPricesConfig()` ad ogni chiamata,
// così l'admin può attivare/disattivare Pro senza redeploy.
import type { PriceQuote, SourceFetchResult } from "../types";
import { getPricesConfig } from "../config";

const COINGECKO_FREE_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE  = "https://pro-api.coingecko.com/api/v3";
const BATCH_SIZE = 250;
const TIMEOUT_MS = 10_000;

interface CoinGeckoEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
}

async function resolveEndpoint(): Promise<CoinGeckoEndpoint> {
  const cfg = await getPricesConfig();
  if (cfg.coingeckoProEnabled && cfg.coingeckoProApiKey) {
    return {
      baseUrl: COINGECKO_PRO_BASE,
      headers: {
        Accept: "application/json",
        "x-cg-pro-api-key": cfg.coingeckoProApiKey,
      },
    };
  }
  return { baseUrl: COINGECKO_FREE_BASE, headers: { Accept: "application/json" } };
}

interface SimplePriceResponse {
  [coingeckoId: string]: {
    usd?: number;
    usd_24h_change?: number;
    usd_24h_vol?: number;
  };
}

export class CoinGeckoError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "CoinGeckoError";
  }
}

/**
 * Fetch prezzi correnti per un set di coin.
 * - Map<coingeckoId, symbol>: l'API restituisce gli ID di CoinGecko, dobbiamo
 *   ri-mappare al ticker per consistenza con il resto del modulo.
 */
export async function fetchCoinGeckoPrices(
  idToSymbol: Map<string, string>,
): Promise<SourceFetchResult> {
  const start = Date.now();
  const ids = Array.from(idToSymbol.keys());
  if (ids.length === 0) {
    return { source: "coingecko", quotes: new Map(), latencyMs: 0 };
  }

  const quotes = new Map<string, PriceQuote>();
  const endpoint = await resolveEndpoint();

  // Batching: l'endpoint accetta CSV di ID, max ~250 per call
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url = new URL(`${endpoint.baseUrl}/simple/price`);
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_24hr_vol", "true");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: endpoint.headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new CoinGeckoError(`CoinGecko network error: ${message}`, undefined, true);
    }
    clearTimeout(timeout);

    if (response.status === 429) {
      throw new CoinGeckoError("CoinGecko rate limit (429)", 429, true);
    }
    if (!response.ok) {
      throw new CoinGeckoError(
        `CoinGecko HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }

    const data = (await response.json()) as SimplePriceResponse;
    for (const [coingeckoId, payload] of Object.entries(data)) {
      const symbol = idToSymbol.get(coingeckoId);
      if (!symbol || typeof payload.usd !== "number") continue;
      quotes.set(symbol, {
        symbol,
        price: payload.usd,
        change24h: typeof payload.usd_24h_change === "number" ? payload.usd_24h_change : null,
        volume24h: typeof payload.usd_24h_vol === "number" ? payload.usd_24h_vol : null,
      });
    }
  }

  return { source: "coingecko", quotes, latencyMs: Date.now() - start };
}

/**
 * Fetch metadata di un coin da /coins/{id} (usato dal "force re-fetch" admin
 * e dall'on-demand fetch quando un coin è citato per la prima volta).
 */
interface CoinDetailResponse {
  id: string;
  symbol: string;
  name: string;
  image?: { small?: string; thumb?: string };
  market_data?: { market_cap?: { usd?: number } };
  categories?: string[];
}

/**
 * Fetch top N coin per market cap via /coins/markets. Usato dal bulk import
 * admin per popolare il registry rapidamente. Una sola call ritorna fino a
 * 250 coin con id+symbol+name+image+market_cap — niente fetch coin-by-coin
 * (che esaurirebbe il rate limit free in pochi click).
 *
 * Note: `category` NON viene da questo endpoint (serve /coins/{id} per
 * averla). Lasciata null all'insert; un Refetch metadata successivo (o un
 * cron futuro) la popola.
 */
interface CoinMarketResponse {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap?: number;
  market_cap_rank?: number;
}

export async function fetchTopCoinsByMarketCap(
  perPage: number,
  page: number,
): Promise<
  Array<{
    coingeckoId: string;
    symbol: string;
    name: string;
    imageUrl: string;
    marketCap: number | null;
  }>
> {
  const endpoint = await resolveEndpoint();
  const url = new URL(`${endpoint.baseUrl}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sparkline", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: endpoint.headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      throw new CoinGeckoError("CoinGecko rate limit (429)", 429, true);
    }
    if (!res.ok) {
      throw new CoinGeckoError(
        `CoinGecko HTTP ${res.status}`,
        res.status,
        res.status >= 500,
      );
    }
    const data = (await res.json()) as CoinMarketResponse[];
    return data.map((c) => ({
      coingeckoId: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      imageUrl: c.image,
      marketCap: typeof c.market_cap === "number" ? c.market_cap : null,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCoinMetadata(coingeckoId: string): Promise<{
  symbol: string;
  name: string;
  imageUrl?: string;
  marketCap?: number;
  category?: string;
} | null> {
  const endpoint = await resolveEndpoint();
  const url = `${endpoint.baseUrl}/coins/${encodeURIComponent(coingeckoId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: endpoint.headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CoinDetailResponse;
    return {
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      imageUrl: data.image?.small ?? data.image?.thumb,
      marketCap: data.market_data?.market_cap?.usd,
      category: data.categories?.[0] ?? undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
