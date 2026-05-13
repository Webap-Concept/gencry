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

interface MarketsResponseItem {
  id: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  total_volume?: number;
  market_cap?: number;
  market_cap_rank?: number;
  sparkline_in_7d?: { price?: number[] };
}

/** Downsample 168 punti orari → 21 punti (3 al giorno). Prendiamo l'ultimo
 *  punto di ogni finestra 8h (indici 7, 15, 23, …, 167). Se la sparkline
 *  ha meno di 168 punti (può capitare per coin recenti), ricalibriamo lo
 *  step proporzionalmente. */
function downsampleSparkline(points: number[] | undefined): number[] | null {
  if (!points || points.length < 2) return null;
  const target = 21;
  if (points.length <= target) return points.filter((n) => Number.isFinite(n));
  const step = points.length / target;
  const out: number[] = [];
  for (let i = 1; i <= target; i++) {
    // Indice dell'ultimo punto di ogni finestra
    const idx = Math.min(points.length - 1, Math.floor(i * step) - 1);
    const v = points[idx];
    if (Number.isFinite(v)) out.push(v);
  }
  return out.length >= 2 ? out : null;
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

  // Batching: /coins/markets accetta `ids` CSV con max ~250 per page.
  // Usiamo questo endpoint invece di /simple/price perché ritorna ANCHE la
  // sparkline 7d (sparkline_in_7d.price = 168 punti orari), che il
  // sync downsampla a 21 punti (3/giorno) per `prices_data.weekly_sparkline`.
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url = new URL(`${endpoint.baseUrl}/coins/markets`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("per_page", String(BATCH_SIZE));
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "true");
    url.searchParams.set("price_change_percentage", "24h");
    // CRITICO: senza `precision=full`, `/coins/markets` arrotonda
    // `current_price` all'intero per asset >$1 ("$79733" invece di
    // "$79733.05"). `/simple/price` non aveva questo problema, ma noi
    // abbiamo migrato a `/coins/markets` per la sparkline. Vedi:
    // https://docs.coingecko.com/reference/coins-markets
    url.searchParams.set("precision", "full");

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

    const data = (await response.json()) as MarketsResponseItem[];
    for (const item of data) {
      const symbol = idToSymbol.get(item.id);
      if (!symbol || typeof item.current_price !== "number") continue;
      quotes.set(symbol, {
        symbol,
        price: item.current_price,
        change24h:
          typeof item.price_change_percentage_24h === "number"
            ? item.price_change_percentage_24h
            : null,
        volume24h: typeof item.total_volume === "number" ? item.total_volume : null,
        sparkline7d: downsampleSparkline(item.sparkline_in_7d?.price),
        marketCap: typeof item.market_cap === "number" ? item.market_cap : null,
        marketCapRank:
          typeof item.market_cap_rank === "number" ? item.market_cap_rank : null,
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

// ---------------------------------------------------------------------------
// Market chart (storico per il grafico interattivo)
// ---------------------------------------------------------------------------

interface MarketChartResponse {
  /** Array di [timestamp_ms, price] sortato dal più vecchio al più recente. */
  prices: [number, number][];
}

/**
 * Fetch dello storico prezzi USD per il grafico interattivo. Usato come
 * fallback quando `prices_history` non copre la finestra richiesta (es. 1y
 * quando il modulo è attivo da poche settimane).
 *
 * CoinGecko sceglie automaticamente la granularità in base a `days`:
 *   - 1 → 5 minuti
 *   - 2-90 → 1 ora
 *   - >90 → 1 giorno
 *
 * Ritorna null su errore (404, rate limit, network) — il caller mostra
 * un fallback graceful invece di un crash.
 */
export async function fetchCoinGeckoMarketChart(
  coingeckoId: string,
  days: number,
): Promise<Array<{ ts: Date; price: number }> | null> {
  const endpoint = await resolveEndpoint();
  const url = new URL(`${endpoint.baseUrl}/coins/${encodeURIComponent(coingeckoId)}/market_chart`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", String(days));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: endpoint.headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MarketChartResponse;
    if (!Array.isArray(data.prices)) return null;
    return data.prices
      .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p))
      .map(([t, p]) => ({ ts: new Date(t), price: p }));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
