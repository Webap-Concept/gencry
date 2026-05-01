// lib/prices/sources/coingecko.ts
// Adapter CoinGecko (free tier). Usa /simple/price con batch fino a 250 ID.
// L'ID CoinGecko (es. "bitcoin", "ethereum") è memorizzato in coins.coingecko_id.
import type { PriceQuote, SourceFetchResult } from "../types";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const BATCH_SIZE = 250;
const TIMEOUT_MS = 10_000;

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

  // Batching: l'endpoint accetta CSV di ID, max ~250 per call
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url = new URL(`${COINGECKO_BASE}/simple/price`);
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_24hr_vol", "true");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
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

export async function fetchCoinMetadata(coingeckoId: string): Promise<{
  symbol: string;
  name: string;
  imageUrl?: string;
  marketCap?: number;
  category?: string;
} | null> {
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
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
