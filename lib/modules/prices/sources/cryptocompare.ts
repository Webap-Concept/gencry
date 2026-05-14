// lib/modules/prices/sources/cryptocompare.ts
// Source secondaria usata SOLO per il backfill storico (admin one-shot,
// non per il cron sync). CryptoCompare ritorna candele OHLCV con `close`
// come prezzo per ogni bucket; noi salviamo solo `close` in
// `prices_history(price)`.
//
// Endpoint pubblici (auth opzionale via `authorization: Apikey <key>`):
//   /data/v2/histohour?fsym=BTC&tsym=USD&limit=N  (1 punto/ora, max 2000)
//   /data/v2/histoday?fsym=BTC&tsym=USD&limit=N   (1 punto/giorno, max 2000)
//
// Free tier (con chiave): 250k req/mese, ~50 req/s. Senza chiave: ~10 req/s
// pubblico. La chiave viene da `modules.prices.cryptocompare_api_key` in
// app_settings (vedi M_prices_007).
import { getPricesConfig } from "../config";

const CC_BASE = "https://min-api.cryptocompare.com";
const TIMEOUT_MS = 15_000;

export type CryptoCompareGranularity = "hour" | "day";

export interface CryptoComparePoint {
  ts: Date;
  /** Close del bucket — quello che salviamo in `prices_history.price`. */
  price: number;
}

export class CryptoCompareError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "CryptoCompareError";
  }
}

interface HistoricalResponse {
  Response: "Success" | "Error";
  Message?: string;
  Data?: {
    Data?: Array<{
      time: number; // unix seconds
      close: number;
      high?: number;
      low?: number;
      open?: number;
    }>;
  };
}

/**
 * Carica `limit` candele storiche (chiuse), dalla più vecchia alla più
 * recente. Ritorna [] se simbolo non disponibile su CryptoCompare —
 * il caller decide se skippare o fallback.
 *
 * `limit` max consigliato: 2000. Granularità "day" copre ~5.5 anni
 * indietro, "hour" copre ~83 giorni. Per coprire 365gg consigliato
 * mixed: prima 30gg hour + poi 30-365gg day.
 */
export async function fetchCryptoCompareHistorical(
  symbol: string,
  granularity: CryptoCompareGranularity,
  limit: number,
): Promise<CryptoComparePoint[]> {
  const cfg = await getPricesConfig();
  const apiKey = cfg.cryptocompareApiKey?.trim() || "";
  const url = new URL(`${CC_BASE}/data/v2/histo${granularity}`);
  url.searchParams.set("fsym", symbol.toUpperCase());
  url.searchParams.set("tsym", "USD");
  url.searchParams.set("limit", String(Math.min(2000, Math.max(1, limit))));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.authorization = `Apikey ${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new CryptoCompareError(`CryptoCompare network error: ${msg}`, undefined, true);
  }
  clearTimeout(timeout);

  if (res.status === 429) {
    throw new CryptoCompareError("CryptoCompare rate limit (429)", 429, true);
  }
  if (!res.ok) {
    throw new CryptoCompareError(
      `CryptoCompare HTTP ${res.status}`,
      res.status,
      res.status >= 500,
    );
  }

  const data = (await res.json()) as HistoricalResponse;
  if (data.Response !== "Success" || !data.Data?.Data) {
    // Es. simbolo non noto: Response="Error". Skippiamo silenziosamente.
    return [];
  }

  return data.Data.Data.filter(
    (d) => Number.isFinite(d.time) && Number.isFinite(d.close) && d.close > 0,
  ).map((d) => ({
    ts: new Date(d.time * 1000),
    price: d.close,
  }));
}
