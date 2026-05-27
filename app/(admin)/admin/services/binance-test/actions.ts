"use server";
// app/(admin)/admin/services/binance-test/actions.ts
//
// Server actions per la test page Binance. Temporanea: sostituita in PR4
// dalla UI completa /admin/services/exchanges. Permesso admin:users come
// gate generico (l'admin services panel definitivo avra' un permesso
// dedicato `admin:services` quando arrivera').
//
// Ogni action chiama DIRETTAMENTE l'adapter Binance, niente cron/DB
// dipendenze, niente Redis: solo il path puro adapter → API → response.

import { binanceAdapter } from "@/lib/modules/prices/exchanges/binance";
import { ExchangeAdapterError } from "@/lib/modules/prices/exchanges/types";
import type {
  ChartRange,
  HealthCheckResult,
  HistoricalPoint,
} from "@/lib/modules/prices/exchanges/types";
import type { PriceQuote } from "@/lib/modules/prices/types";
import { requireAdminSectionPage } from "@/lib/rbac/guards";

export type TestCurrentResult =
  | { ok: true; latencyMs: number; quotes: PriceQuote[] }
  | { ok: false; error: string };

export type TestHistoricalResult =
  | {
      ok: true;
      latencyMs: number;
      symbol: string;
      range: ChartRange;
      points: HistoricalPoint[];
      first: HistoricalPoint | null;
      last: HistoricalPoint | null;
    }
  | { ok: false; error: string };

export type TestHealthResult = HealthCheckResult;

const SAMPLE_INPUTS = [
  { symbol: "BTC", exchangeSymbol: "BTCUSDT" },
  { symbol: "ETH", exchangeSymbol: "ETHUSDT" },
  { symbol: "SOL", exchangeSymbol: "SOLUSDT" },
];

export async function testCurrentPricesAction(): Promise<TestCurrentResult> {
  await requireAdminSectionPage("admin:users");
  const started = Date.now();
  try {
    const map = await binanceAdapter.fetchCurrentPrices(SAMPLE_INPUTS);
    return {
      ok: true,
      latencyMs: Date.now() - started,
      quotes: Array.from(map.values()),
    };
  } catch (err) {
    const message =
      err instanceof ExchangeAdapterError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function testHistoricalAction(
  range: ChartRange = "1m",
): Promise<TestHistoricalResult> {
  await requireAdminSectionPage("admin:users");
  const started = Date.now();
  try {
    const points = await binanceAdapter.fetchHistorical("BTCUSDT", range);
    return {
      ok: true,
      latencyMs: Date.now() - started,
      symbol: "BTCUSDT",
      range,
      points,
      first: points[0] ?? null,
      last: points[points.length - 1] ?? null,
    };
  } catch (err) {
    const message =
      err instanceof ExchangeAdapterError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function testHealthAction(): Promise<TestHealthResult> {
  await requireAdminSectionPage("admin:users");
  return binanceAdapter.healthCheck();
}
