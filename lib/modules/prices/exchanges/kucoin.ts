// lib/modules/prices/exchanges/kucoin.ts
//
// KuCoin Spot public API adapter. No auth richiesta per
// `/api/v1/market/allTickers` + `/api/v1/market/candles` + `/api/v1/symbols`
// (public market data). Rate limit pubblico molto generoso (~30 req/3s/IP
// per i public endpoints) → headroom abbondante per il nostro cron 1/min.
//
// Docs:
//   GET /api/v1/market/allTickers
//     Ritorna { code, data: { time, ticker: [{ symbol, last, changeRate,
//     volValue, ... }] } } — tutti i pair in una sola call. Filtriamo
//     in-process per i symbol richiesti.
//   GET /api/v1/market/candles?type=1day&symbol=BTC-USDT&startAt=<sec>
//     Ritorna { code, data: [[time, open, close, high, low, volume,
//     turnover], ...] } in ordine DESC (newest first). Massimo 1500
//     candele per chiamata. Time e' in SECONDI.
//   GET /api/v1/symbols
//     Lista TUTTI i pair (~1300+), filtriamo per quoteCurrency=USDT
//     + enableTrading=true.
//   GET /api/v1/timestamp
//     Ritorna { code: "200000", data: <unix_ms> } — health probe.
//
// Differenze chiave vs Binance:
//   - Symbol format: "BTC-USDT" (con trattino), non "BTCUSDT".
//   - Response envelope: { code: "200000", data: ... } — code !== "200000"
//     significa errore lato KuCoin anche se HTTP 200.
//   - changeRate e' una frazione decimale (-0.0123), non percent (-1.23).
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

const BASE = "https://api.kucoin.com";
const TIMEOUT_MS = 8_000;

/**
 * Mapping del nostro `ChartRange` -> {type, limit, spanSec} KuCoin.
 *
 *   1d  → 5min candles, last 24h (288 punti)
 *   1w  → 1hour candles, last 7 giorni (168 punti)
 *   1m  → 4hour candles, last 30 giorni (180 punti)
 *   3m  → 12hour candles, last 90 giorni (180 punti)
 *   6m  → 1day candles, last 180 giorni
 *   1y  → 1day candles, last 365 giorni
 *
 * Tutti i bucket stanno sotto il limit 1500 di KuCoin.
 * `spanSec` serve a calcolare `startAt = now - spanSec` (KuCoin ritorna
 * DESC dall'ultimo bucket, quindi serve un floor temporale).
 */
const RANGE_TO_CANDLES: Record<
  ChartRange,
  { type: string; limit: number; spanSec: number }
> = {
  "1d": { type: "5min", limit: 288, spanSec: 24 * 60 * 60 },
  "1w": { type: "1hour", limit: 168, spanSec: 7 * 24 * 60 * 60 },
  "1m": { type: "4hour", limit: 180, spanSec: 30 * 24 * 60 * 60 },
  "3m": { type: "12hour", limit: 180, spanSec: 90 * 24 * 60 * 60 },
  "6m": { type: "1day", limit: 180, spanSec: 180 * 24 * 60 * 60 },
  "1y": { type: "1day", limit: 365, spanSec: 365 * 24 * 60 * 60 },
};

interface KucoinTicker {
  symbol: string;       // "BTC-USDT"
  last: string;         // "67234.05"
  changeRate: string;   // "-0.0123" (decimal fraction, NOT percent)
  volValue: string;     // "1234567890.12" (24h quote volume USDT)
}

interface KucoinAllTickersResponse {
  code: string;
  data?: {
    time: number;
    ticker: KucoinTicker[];
  };
}

/** KuCoin candle tuple: [time(sec), open, close, high, low, volume, turnover] */
type KucoinCandle = [string, string, string, string, string, string, string];

interface KucoinCandlesResponse {
  code: string;
  data?: KucoinCandle[];
}

interface KucoinSymbol {
  symbol: string;          // "BTC-USDT"
  quoteCurrency: string;   // "USDT"
  enableTrading: boolean;
}

interface KucoinSymbolsResponse {
  code: string;
  data?: KucoinSymbol[];
}

interface KucoinTimestampResponse {
  code: string;
  data?: number;
}

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

export const kucoinAdapter: PriceExchangeAdapter = {
  id: "kucoin",
  label: "KuCoin",
  needsApiKey: "no",

  buildUsdSymbol(canonical) {
    return `${canonical.toUpperCase()}-USDT`;
  },

  async fetchCurrentPrices(inputs: ExchangeFetchInput[]) {
    const result = new Map<string, PriceQuote>();
    if (inputs.length === 0) return result;

    // Build mapping exchangeSymbol → canonical symbol per il ri-mapping
    // dell'output.
    const reverseMap = new Map<string, string>();
    for (const inp of inputs) {
      if (!inp.exchangeSymbol) continue;
      reverseMap.set(inp.exchangeSymbol.toUpperCase(), inp.symbol.toUpperCase());
    }
    if (reverseMap.size === 0) return result;

    // KuCoin non supporta "filtra per N symbol" sull'allTickers: ritorna
    // sempre TUTTI i pair (~1300). 1 sola call, filter in-process.
    const url = `${BASE}/api/v1/market/allTickers`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ExchangeAdapterError("kucoin", `network error: ${message}`);
    }

    if (response.status === 429) {
      throw new ExchangeAdapterError("kucoin", "rate limit (429)", 429, true);
    }
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "kucoin",
        `HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }

    const payload = (await response.json()) as KucoinAllTickersResponse;
    // KuCoin envelope: success = code "200000". Errori applicativi
    // arrivano con HTTP 200 ma code !== "200000" + message.
    if (payload.code !== "200000" || !payload.data?.ticker) {
      throw new ExchangeAdapterError(
        "kucoin",
        `allTickers code=${payload.code}`,
        response.status,
        true,
      );
    }

    for (const item of payload.data.ticker) {
      const sym = item.symbol?.toUpperCase();
      const canonical = sym ? reverseMap.get(sym) : undefined;
      if (!canonical) continue;
      const price = Number.parseFloat(item.last);
      if (!Number.isFinite(price)) continue;
      // changeRate KuCoin = frazione decimale (-0.0123). Lo convertiamo
      // in percent (-1.23) per coerenza con il resto del sistema.
      const rate = Number.parseFloat(item.changeRate);
      const changePct = Number.isFinite(rate) ? rate * 100 : null;
      const volume = Number.parseFloat(item.volValue);
      result.set(canonical, {
        symbol: canonical,
        price,
        change24h: changePct,
        volume24h: Number.isFinite(volume) ? volume : null,
        // KuCoin NON espone questi: vengono dal layer "slow" CoinGecko.
        sparkline7d: null,
        marketCap: null,
        marketCapRank: null,
      });
    }
    return result;
  },

  async fetchHistorical(exchangeSymbol, range) {
    const cfg = RANGE_TO_CANDLES[range];
    const nowSec = Math.floor(Date.now() / 1000);
    const startAt = nowSec - cfg.spanSec;

    const url = new URL(`${BASE}/api/v1/market/candles`);
    url.searchParams.set("symbol", exchangeSymbol.toUpperCase());
    url.searchParams.set("type", cfg.type);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("endAt", String(nowSec));

    let response: Response;
    try {
      response = await fetchWithTimeout(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ExchangeAdapterError("kucoin", `candles network: ${message}`);
    }
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "kucoin",
        `candles HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }
    const payload = (await response.json()) as KucoinCandlesResponse;
    if (payload.code !== "200000" || !Array.isArray(payload.data)) {
      throw new ExchangeAdapterError(
        "kucoin",
        `candles code=${payload.code}`,
        response.status,
        true,
      );
    }

    // KuCoin ritorna DESC (newest first). Reverse per ordine cronologico
    // crescente, come si aspetta Recharts.
    const points: HistoricalPoint[] = [];
    for (let i = payload.data.length - 1; i >= 0; i--) {
      const k = payload.data[i];
      // k[0] = time in SECONDI, k[2] = close
      const tsSec = Number(k[0]);
      const close = Number.parseFloat(k[2]);
      if (!Number.isFinite(tsSec) || !Number.isFinite(close)) continue;
      points.push({ ts: tsSec * 1000, price: close });
    }
    // Trim al limit configurato (KuCoin a volte ritorna piu' del previsto
    // per intervalli edge).
    if (points.length > cfg.limit) {
      return points.slice(points.length - cfg.limit);
    }
    return points;
  },

  async listSupportedUsdSymbols(): Promise<Set<string>> {
    // /api/v1/symbols ritorna TUTTI i pair (~1300+). Filtriamo per
    // quoteCurrency='USDT' + enableTrading=true → set di ~700+ exchange
    // symbol (es. "BTC-USDT", "ETH-USDT", ...) usabili per il bulk
    // auto-map. 1 sola call, in-memory match O(1) per N coin.
    try {
      const res = await fetchWithTimeout(`${BASE}/api/v1/symbols`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new ExchangeAdapterError(
          "kucoin",
          `symbols HTTP ${res.status}`,
          res.status,
          true,
        );
      }
      const payload = (await res.json()) as KucoinSymbolsResponse;
      if (payload.code !== "200000" || !Array.isArray(payload.data)) {
        throw new ExchangeAdapterError(
          "kucoin",
          `symbols code=${payload.code}`,
          res.status,
          true,
        );
      }
      const out = new Set<string>();
      for (const s of payload.data) {
        if (s.enableTrading && s.quoteCurrency === "USDT") {
          out.add(s.symbol.toUpperCase());
        }
      }
      return out;
    } catch (err) {
      if (err instanceof ExchangeAdapterError) throw err;
      const message = err instanceof Error ? err.message : "unknown";
      throw new ExchangeAdapterError("kucoin", `symbols ${message}`);
    }
  },

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      // /api/v1/timestamp = endpoint piu' leggero pubblico, ritorna
      // { code: "200000", data: <unix_ms> }. Probe canonico.
      const res = await fetchWithTimeout(`${BASE}/api/v1/timestamp`, {
        headers: { Accept: "application/json" },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }
      const payload = (await res.json()) as KucoinTimestampResponse;
      if (payload.code !== "200000") {
        return {
          ok: false,
          latencyMs,
          error: `code=${payload.code}`,
        };
      }
      return { ok: true, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : "unknown";
      return { ok: false, latencyMs, error: message };
    }
  },
};
