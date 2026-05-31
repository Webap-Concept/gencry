// lib/modules/prices/exchanges/gate.ts
//
// Gate.io Spot public API (v4) adapter. No auth richiesta per i public
// market data. Rate limit pubblico generoso → headroom per il cron 1/min.
//
// Docs: https://www.gate.io/docs/developers/apiv4/
//   GET /api/v4/spot/tickers
//     Ritorna l'array di TUTTI i pair: [{ currency_pair, last,
//     change_percentage, quote_volume, ... }]. 1 sola call, filter
//     in-process per i symbol richiesti.
//   GET /api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=5m&limit=288
//     Ritorna [[ts_sec, quote_vol, close, high, low, open, base_vol, closed]]
//     (max 1000 candele). close = index 2, ts = index 0 (in SECONDI).
//   GET /api/v4/spot/currency_pairs
//     Lista TUTTI i pair; filtriamo quote=USDT + trade_status=tradable.
//   GET /api/v4/spot/currency_pairs/BTC_USDT
//     Info di un singolo pair → health probe leggero.
//
// Differenze chiave vs Binance/KuCoin:
//   - Symbol format: "BTC_USDT" (underscore), non "BTCUSDT" né "BTC-USDT".
//   - tickers/candlesticks = array nudi (nessun envelope { code, data }).
//   - change_percentage è GIÀ in percent ("-1.23"), come Binance e a
//     differenza di KuCoin (frazione decimale).
//   - Esclusione token a leva (es. "BTC3L"/"ETH3S"/"SOL5L"): non sono coin
//     spot ma ETP strutturati → li filtriamo da listSupported* così non
//     entrano nell'import wholesale.
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

const BASE = "https://api.gateio.ws/api/v4";
const TIMEOUT_MS = 8_000;

// Base che termina con <cifra>L|S → token a leva Gate (BTC3L, ETH3S, SOL5L…).
const LEVERAGED = /\d[LS]$/;

/**
 * Mapping del nostro `ChartRange` -> {interval, limit} Gate. Intervalli
 * Gate validi: 1m,5m,15m,30m,1h,4h,8h,1d,7d,30d (no 12h → 3m usa 8h).
 * Tutti i bucket stanno sotto il limit 1000 di Gate.
 */
const RANGE_TO_CANDLES: Record<ChartRange, { interval: string; limit: number }> = {
  "1d": { interval: "5m", limit: 288 },
  "1w": { interval: "1h", limit: 168 },
  "1m": { interval: "4h", limit: 180 },
  "3m": { interval: "8h", limit: 270 },
  "6m": { interval: "1d", limit: 180 },
  "1y": { interval: "1d", limit: 365 },
};

interface GateTicker {
  currency_pair: string;     // "BTC_USDT"
  last: string;              // "67000.0"
  change_percentage: string; // "-1.23" (percent, NON frazione)
  quote_volume: string;      // "82000000.0" (24h volume in USDT ≈ USD)
}

interface GateCurrencyPair {
  id: string;            // "BTC_USDT"
  base: string;          // "BTC"
  quote: string;         // "USDT"
  trade_status: string;  // "tradable" | "untradable" | "buyable" | "sellable"
}

/** Gate candle: [ts_sec, quote_vol, close, high, low, open, base_vol, closed] */
type GateCandle = [string, string, string, string, string, string, string, string?];

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

export const gateAdapter: PriceExchangeAdapter = {
  id: "gate",
  label: "Gate.io",
  needsApiKey: "no",

  buildUsdSymbol(canonical) {
    return `${canonical.toUpperCase()}_USDT`;
  },

  async fetchCurrentPrices(inputs: ExchangeFetchInput[]) {
    const result = new Map<string, PriceQuote>();
    if (inputs.length === 0) return result;

    // Build mapping exchangeSymbol → canonical per il ri-mapping output.
    const reverseMap = new Map<string, string>();
    for (const inp of inputs) {
      if (!inp.exchangeSymbol) continue;
      reverseMap.set(inp.exchangeSymbol.toUpperCase(), inp.symbol.toUpperCase());
    }
    if (reverseMap.size === 0) return result;

    // Gate non supporta "filtra per N pair" sui tickers: ritorna sempre
    // TUTTI i pair (~2-3k). 1 sola call, filter in-process.
    let response: Response;
    try {
      response = await fetchWithTimeout(`${BASE}/spot/tickers`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ExchangeAdapterError("gate", `network error: ${message}`);
    }

    if (response.status === 429) {
      throw new ExchangeAdapterError("gate", "rate limit (429)", 429, true);
    }
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "gate",
        `HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }

    const data = (await response.json()) as GateTicker[];
    for (const item of data) {
      const sym = item.currency_pair?.toUpperCase();
      const canonical = sym ? reverseMap.get(sym) : undefined;
      if (!canonical) continue;
      const price = Number.parseFloat(item.last);
      if (!Number.isFinite(price)) continue;
      // change_percentage Gate = già percent (-1.23), nessuna conversione.
      const change = Number.parseFloat(item.change_percentage);
      const volume = Number.parseFloat(item.quote_volume);
      result.set(canonical, {
        symbol: canonical,
        price,
        change24h: Number.isFinite(change) ? change : null,
        volume24h: Number.isFinite(volume) ? volume : null,
        // Gate NON espone questi: vengono dal layer "slow" CoinGecko.
        sparkline7d: null,
        marketCap: null,
        marketCapRank: null,
      });
    }
    return result;
  },

  async fetchHistorical(exchangeSymbol, range) {
    const cfg = RANGE_TO_CANDLES[range];
    const url = new URL(`${BASE}/spot/candlesticks`);
    url.searchParams.set("currency_pair", exchangeSymbol.toUpperCase());
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
      throw new ExchangeAdapterError("gate", `candles network: ${message}`);
    }
    if (!response.ok) {
      throw new ExchangeAdapterError(
        "gate",
        `candles HTTP ${response.status}`,
        response.status,
        response.status >= 500,
      );
    }

    const data = (await response.json()) as GateCandle[];
    const points: HistoricalPoint[] = [];
    for (const k of data) {
      // k[0] = time in SECONDI, k[2] = close
      const tsSec = Number(k[0]);
      const close = Number.parseFloat(k[2]);
      if (!Number.isFinite(tsSec) || !Number.isFinite(close)) continue;
      points.push({ ts: tsSec * 1000, price: close });
    }
    // Gate ritorna ASC ma ordiniamo per sicurezza (Recharts vuole crescente).
    points.sort((a, b) => a.ts - b.ts);
    return points;
  },

  async listSupportedUsdSymbols(): Promise<Set<string>> {
    // /spot/currency_pairs ritorna TUTTI i pair. Filtriamo per quote=USDT +
    // trade_status='tradable' + NON token a leva → set di pair id
    // ("BTC_USDT", ...) per il bulk auto-map.
    try {
      const res = await fetchWithTimeout(`${BASE}/spot/currency_pairs`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new ExchangeAdapterError(
          "gate",
          `currency_pairs HTTP ${res.status}`,
          res.status,
          true,
        );
      }
      const data = (await res.json()) as GateCurrencyPair[];
      const out = new Set<string>();
      for (const p of data) {
        if (p.quote !== "USDT" || p.trade_status !== "tradable") continue;
        const base = p.base?.toUpperCase();
        if (!base || LEVERAGED.test(base)) continue;
        out.add(p.id.toUpperCase());
      }
      return out;
    } catch (err) {
      if (err instanceof ExchangeAdapterError) throw err;
      const message = err instanceof Error ? err.message : "unknown";
      throw new ExchangeAdapterError("gate", `currency_pairs ${message}`);
    }
  },

  async listSupportedUsdMarkets() {
    // 1 call /spot/tickers (volume) + 1 /spot/currency_pairs (validità).
    // validSet esclude già non-tradable + token a leva.
    const [tickerRes, validSet] = await Promise.all([
      fetchWithTimeout(`${BASE}/spot/tickers`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      this.listSupportedUsdSymbols!(),
    ]);
    if (!tickerRes.ok) {
      throw new ExchangeAdapterError(
        "gate",
        `tickers HTTP ${tickerRes.status}`,
        tickerRes.status,
        true,
      );
    }
    const data = (await tickerRes.json()) as GateTicker[];
    const out: Array<{
      exchangeSymbol: string;
      canonicalSymbol: string;
      volume24h: number;
    }> = [];
    for (const t of data) {
      const sym = t.currency_pair?.toUpperCase();
      if (!sym || !validSet.has(sym)) continue;
      // Gate format "BTC_USDT" → strip "_USDT" suffix.
      const base = sym.endsWith("_USDT") ? sym.slice(0, -5) : sym;
      if (!base) continue;
      const volume = Number.parseFloat(t.quote_volume);
      out.push({
        exchangeSymbol: sym,
        canonicalSymbol: base,
        volume24h: Number.isFinite(volume) ? volume : 0,
      });
    }
    return out;
  },

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      // Info di un singolo pair = endpoint leggero, conferma API up.
      const res = await fetchWithTimeout(
        `${BASE}/spot/currency_pairs/BTC_USDT`,
        { headers: { Accept: "application/json" } },
      );
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
