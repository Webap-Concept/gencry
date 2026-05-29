import "server-only";
// lib/modules/watchlist/perf-cache.ts
//
// Cache Redis per la "perf 30g" delle coin contenute nelle watchlist.
//
// Design — per-coin, non per-watchlist:
//   key: `watchlist:coin-perf:<SYMBOL>:30d` → number (pct) | null
//   TTL: setting `modules.watchlist.perf_cache_ttl_seconds` (default 300s)
//
// Vantaggio: BTC che e' in 5 watchlist condivide una sola entry — 1
// compute (history fetch + delta) per coin per finestra TTL, non N.
//
// Pattern cache-aside hookable:
//   getCoinsPerf30d(symbols)
//     → MGET batch su Upstash
//     → per i miss: chiama `computeCoinPerf30d(symbol)` (history fetch
//        del modulo prices, source-of-truth) e SETEX
//     → ritorna map { [SYMBOL]: pct | null }
//
// Se Upstash non e' configurato: degrada a pass-through (compute on every
// call). Niente throw — la pagina watchlist deve funzionare sempre.
//
// Compute della perf 30g: usa l'history 1m del modulo prices, lookup
// (lastPrice - firstPrice) / firstPrice * 100. Null se history vuota
// o malformata (nuova coin senza storia, fetch failed).

import { getRedisClient } from "@/lib/kv/sdk";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getHistorySeries } from "@/lib/modules/prices/queries";

const KEY_PREFIX = "watchlist:coin-perf:";
const SUFFIX_30D = ":30d";
const DEFAULT_TTL_SECONDS = 300;

function keyFor(symbol: string): string {
  return `${KEY_PREFIX}${symbol.toUpperCase()}${SUFFIX_30D}`;
}

async function loadTtl(): Promise<number> {
  // settings reader e' cached process-local; safe a chiamare per call.
  const settings = await getAppSettings();
  const raw = settings["modules.watchlist.perf_cache_ttl_seconds"];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

/**
 * Compute la perf 30g di una singola coin via history 1m. Null se
 * dati insufficienti. Esportata per il path "no-cache".
 */
export async function computeCoinPerf30d(
  symbol: string,
): Promise<number | null> {
  try {
    const series = await getHistorySeries(symbol, "1m");
    if (!series || series.points.length < 2) return null;
    const first = series.points[0].price;
    const last = series.points[series.points.length - 1].price;
    if (!Number.isFinite(first) || first === 0) return null;
    if (!Number.isFinite(last)) return null;
    return ((last - first) / first) * 100;
  } catch (err) {
    console.warn("[watchlist:perf-cache] compute failed", {
      symbol,
      err: String(err),
    });
    return null;
  }
}

/**
 * Batch lookup perf 30g per N coin.
 *   - Upstash configurato → MGET batch; miss compute + SETEX (best-effort).
 *   - Non configurato     → compute on-the-fly per ogni symbol.
 *
 * Ritorna sempre una map completa: ogni symbol passato ha una entry
 * (`null` se compute fallisce / history mancante).
 */
export async function getCoinsPerf30d(
  symbols: string[],
): Promise<Record<string, number | null>> {
  if (symbols.length === 0) return {};
  // Dedup + normalize.
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));

  const client = await getRedisClient();
  if (!client) {
    // Pass-through fallback. Compute parallel per non bloccare; il modulo
    // prices ha cache propria su getHistorySeries quindi questo non
    // esplode anche con symbol ripetuti tra render.
    const entries = await Promise.all(
      unique.map(async (s) => [s, await computeCoinPerf30d(s)] as const),
    );
    return Object.fromEntries(entries);
  }

  // MGET batch dei valori cached.
  const keys = unique.map(keyFor);
  let cached: (number | null)[] = [];
  try {
    cached = (await client.mget<(number | null)[]>(...keys)) ?? [];
  } catch (err) {
    console.warn("[watchlist:perf-cache] mget failed", { err: String(err) });
    cached = [];
  }

  const out: Record<string, number | null> = {};
  const missIdx: number[] = [];
  for (let i = 0; i < unique.length; i++) {
    const v = cached[i];
    if (v === null || v === undefined) {
      missIdx.push(i);
    } else {
      out[unique[i]] = typeof v === "number" ? v : null;
    }
  }

  if (missIdx.length === 0) return out;

  // Compute per i miss + SETEX best-effort.
  const ttl = await loadTtl();
  const computed = await Promise.all(
    missIdx.map((i) => computeCoinPerf30d(unique[i])),
  );
  for (let j = 0; j < missIdx.length; j++) {
    const i = missIdx[j];
    const symbol = unique[i];
    const value = computed[j];
    out[symbol] = value;
    // Cache solo i valori non null per evitare di shadow l'attesa che la
    // history arrivi (su coin nuova history e' transient). TTL anche su
    // null sarebbe valido ma preferiamo refresh rapido nei primi giorni.
    if (value !== null) {
      try {
        await client.set(keyFor(symbol), value, { ex: ttl });
      } catch (err) {
        console.warn("[watchlist:perf-cache] set failed", {
          symbol,
          err: String(err),
        });
      }
    }
  }
  return out;
}

/**
 * Calcola la perf media di un set di coin a partire dalla map MGET.
 * Media semplice (non pesata) — V1. Quando avremo pesi per-coin
 * (allocation %) passeremo a media pesata.
 *
 * Null se la watchlist e' vuota o se NESSUNA coin ha perf disponibile
 * (cold storage / history mancante per tutte). Skip dei null se almeno
 * una coin ha dato (drift accettato per V1 — alternativa "tutto o
 * nulla" sarebbe inutilizzabile finche' una sola coin nuova rompe il
 * calcolo dell'intera watchlist).
 */
export function averagePerf(
  symbols: string[],
  perfMap: Record<string, number | null>,
): number | null {
  if (symbols.length === 0) return null;
  const values: number[] = [];
  for (const s of symbols) {
    const v = perfMap[s.toUpperCase()];
    if (typeof v === "number" && Number.isFinite(v)) values.push(v);
  }
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Invalidate cache per una specifica coin. Da chiamare quando il modulo
 * prices fa un metadata refresh che potrebbe aver cambiato la serie
 * storica (poco frequente, ma utile per evitare staleness oltre TTL).
 *
 * No-throw: best-effort.
 */
export async function invalidateCoinPerf30d(symbol: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(keyFor(symbol));
  } catch (err) {
    console.warn("[watchlist:perf-cache] del failed", {
      symbol,
      err: String(err),
    });
  }
}
