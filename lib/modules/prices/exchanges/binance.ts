// lib/modules/prices/exchanges/binance.ts
//
// Binance Spot public API adapter. No auth richiesta per `/ticker/24hr`
// + `/klines` (public market data). Rate limit: 1200 weight/min/IP,
// `/ticker/24hr` batched costa 40 weight indipendentemente dal numero
// di symbols → headroom abbondante per il nostro cron 1/min.
//
// Docs:
//   GET /api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT",...]
//     Ritorna array di ticker (lastPrice, priceChangePercent, quoteVolume).
//   GET /api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365
//     Ritorna candele OHLCV. Limit max 1000.
import "server-only";

import type {
  ChartRange,
  ExchangeFetchInput,
  HealthCheckResult,
  HistoricalPoint,
  PriceExchangeAdapter,
} from "./types";
import { ExchangeAdapterError } from "./types";
import type { PriceQuote } from "../types";

const BASE = "https://api.binance.com";
const TIMEOUT_MS = 8_000;

/**
 * Mapping del nostro `ChartRange` -> {interval, limit} Binance.
 *
 *   1d  → 5-min candles, last 24h (288 punti)
 *   1w  → 1-hour candles, last 7 giorni (168 punti)
 *   1m  → 4-hour candles, last 30 giorni (180 punti)
 *   3m  → 12-hour candles, last 90 giorni (180 punti)
 *   6m  → 1-day candles, last 180 giorni
 *   1y  → 1-day candles, last 365 giorni
 *
 * Tutti i bucket stanno sotto il limit 1000 di Binance.
 */
const RANGE_TO_KLINES: Record<ChartRange, { interval: string; limit: number }> = {
  "1d": { interval: "5m", limit: 288 },
  "1w": { interval: "1h", limit: 168 },
  "1m": { interval: "4h", limit: 180 },
  "3m": { interval: "12h", limit: 180 },
  "6m": { interval: "1d", limit: 180 },
  "1y": { interval: "1d", limit: 365 },
};

interface Binance24hrTicker {
  symbol: string;            // "BTCUSDT"
  lastPrice: string;         // "67234.05"
  priceChangePercent: string; // "-1.23"
  quoteVolume: string;       // "1234567890.12" (USDT volume = ~USD)
}

/** Binance kline tuple: [openTime, open, high, low, close, volume, closeTime, ...] */
type BinanceKline = [
  number, string, string, string, string, string, number,
  string, number, string, string, string,
];

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export const binanceAdapter: PriceExchangeAdapter = {
  id: "binance",
  label: "Binance",
  needsApiKey: "no",

  async fetchCurrentPrices(inputs: ExchangeFetchInput[]) {
    const result = new Map<string, PriceQuote>();
    if (inputs.length === 0) return result;

    // Build mapping exchangeSymbol → canonical symbol per il ri-mapping
    // dell'output.
    const reverseMap = new Map<string, string>();
    const exchangeSymbols: string[] = [];
    for (const inp of inputs) {
      if (!inp.exchangeSymbol) continue;
      const sym = inp.exchangeSymbol.toUpperCase();
      reverseMap.set(sym, inp.symbol.toUpperCase());
      exchangeSymbols.push(sym);
    }
    if (exchangeSymbols.length === 0) return result;

    // `symbols` deve essere JSON array stringato.
    const url = new URL(`${BASE}/api/v3/ticker/24hr`);
    url.searchParams.set("symbols", JSON.stringify(exchangeSymbols));

    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ExchangeAdapterError("binance", `network error: ${message}`);
    }

    if (response.status === 429) {
      throw new ExchangeAdapterError("binance", "rate limit (429)", 429, true);
    }
    // 400 con un singolo symbol invalido nel batch → la response 400
    // include tutto il body, niente parziale. Il caller fallback per quei
    // coin. Per ora propaghiamo l'errore.
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "binance",
        `HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }

    const data = (await response.json()) as Binance24hrTicker[];
    for (const item of data) {
      const symbol = reverseMap.get(item.symbol);
      if (!symbol) continue;
      const price = Number.parseFloat(item.lastPrice);
      if (!Number.isFinite(price)) continue;
      const change = Number.parseFloat(item.priceChangePercent);
      const volume = Number.parseFloat(item.quoteVolume);
      result.set(symbol, {
        symbol,
        price,
        change24h: Number.isFinite(change) ? change : null,
        volume24h: Number.isFinite(volume) ? volume : null,
        // Binance NON espone questi: vengono dal layer "slow" CoinGecko.
        sparkline7d: null,
        marketCap: null,
        marketCapRank: null,
      });
    }
    return result;
  },

  async fetchHistorical(exchangeSymbol, range) {
    const cfg = RANGE_TO_KLINES[range];
    const url = new URL(`${BASE}/api/v3/klines`);
    url.searchParams.set("symbol", exchangeSymbol.toUpperCase());
    url.searchParams.set("interval", cfg.interval);
    url.searchParams.set("limit", String(cfg.limit));

    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ExchangeAdapterError("binance", `klines network: ${message}`);
    }
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "binance",
        `klines HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }
    const data = (await response.json()) as BinanceKline[];
    const points: HistoricalPoint[] = [];
    for (const k of data) {
      // k[6] = closeTime ms, k[4] = close string
      const ts = Number(k[6]);
      const close = Number.parseFloat(k[4]);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
      points.push({ ts, price: close });
    }
    return points;
  },

  async listSupportedUsdSymbols(): Promise<Set<string>> {
    // /api/v3/exchangeInfo ritorna TUTTI i pair attivi (~5MB JSON).
    // Filtriamo per quoteAsset='USDT' + status='TRADING' → set di ~400+
    // exchange symbol (es. "BTCUSDT", "ETHUSDT", ...) usabili per il
    // bulk auto-map. 1 sola call, in-memory match O(1) per N coin.
    try {
      const res = await fetchWithTimeout(`${BASE}/api/v3/exchangeInfo`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new ExchangeAdapterError(
          "binance",
          `exchangeInfo HTTP ${res.status}`,
          res.status,
          true,
        );
      }
      const data = (await res.json()) as {
        symbols?: Array<{
          symbol: string;
          status: string;
          quoteAsset: string;
        }>;
      };
      const out = new Set<string>();
      for (const s of data.symbols ?? []) {
        if (s.status === "TRADING" && s.quoteAsset === "USDT") {
          out.add(s.symbol.toUpperCase());
        }
      }
      return out;
    } catch (err) {
      if (err instanceof ExchangeAdapterError) throw err;
      const message = err instanceof Error ? err.message : "unknown";
      throw new ExchangeAdapterError("binance", `exchangeInfo ${message}`);
    }
  },

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      // /api/v3/ping = 1 weight, ritorna {} se up. Endpoint canonico per
      // probe pubblico.
      const res = await fetchWithTimeout(`${BASE}/api/v3/ping`, {
        headers: { Accept: "application/json" },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }
      return { ok: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : "unknown";
      return { ok: false, latencyMs, error: message };
    }
  },
};
