// lib/modules/prices/services/hot-prices.ts
//
// Hot layer Upstash dei prezzi correnti. Pattern del refactor
// "Redis-first prices":
//
//   - SCRITTORE (cron sync): chiama setHotPrices(quotes) ogni minuto.
//     1 SET su 1 chiave gigante JSON con tutti i ~500 coin (TTL 90s).
//   - LETTORE (UI / API / chart): chiama getHotPrices() che ritorna
//     una Map<symbol, PriceQuote>. Latenza ~5-20ms (Upstash REST + JSON
//     parse).
//
// Fallback: se Upstash non e' configurato o down, hot layer ritorna
// null/Map vuota. Il caller decide se cadere su `prices_data` (DB cold
// backup) o degradare la UI. Vedi pattern hookable-services del progetto.
//
// Chiave singola vs N chiavi: scelta deliberata. 500 coin × ~200 byte =
// ~100KB per chiave: ben sotto il limit Upstash (1MB/key). 1 GET ritorna
// l'intero snapshot → la coin page legge 1 sola chiave. N chiavi separate
// (1 per coin) richiederebbero MGET batched + 1 chiave per coin nel
// counter command (consumo Upstash 4x). Riconsidera se mai dovessimo
// passare di 5000+ coin.
import "server-only";

import { getRedisClient } from "@/lib/kv/sdk";
import type { PriceQuote } from "../types";

/** Chiave singola con snapshot completo.
 *  CAVEAT: NON usare `prices:current:all` — quella e' la chiave del
 *  vecchio cache-aside in lib/modules/prices/queries.ts che salva un
 *  ARRAY `CachedPriceRow[]`, non l'oggetto `HotPricesPayload`. Collisione
 *  di shape: il vecchio reader sovrascrive il payload nuovo al primo
 *  cache miss. Risolto rinominando a `prices:hot:v1` finche' il vecchio
 *  path non viene deprecato in PR4. */
const HOT_PRICES_KEY = "prices:hot:v1";
/** TTL default ipotizzando cron a 1 min (90s = 1.5x). Il cron schedulato
 *  passa SEMPRE un TTL esplicito basato su `cron_minutes * 60 + 60s grace`
 *  cosi' il valore si adatta in automatico ai cambi di cadence senza
 *  rischiare gap (TTL troppo corto = chiave evapora tra un tick e l'altro). */
const DEFAULT_HOT_PRICES_TTL_SECONDS = 90;

/** Shape persistita su Redis. `updatedAt` permette al lettore di
 *  decidere se il payload e' troppo vecchio per essere mostrato senza
 *  staleness banner (V2). */
export interface HotPricesPayload {
  updatedAt: number; // unix ms
  /** Map serializzata come Record per JSON compat. Chiave = symbol UPPER. */
  quotes: Record<string, PriceQuote>;
}

/**
 * Scrive lo snapshot in Redis. Idempotente: il caller passa l'intera
 * collezione, qui rimpiazziamo il valore (no merge incrementale).
 *
 * Errori sono loggati ma NON throw-ati: il cron continua a salvare in
 * DB come fallback. Se Redis manca o e' down, l'app non si rompe.
 */
export async function setHotPrices(
  quotes: Map<string, PriceQuote>,
  opts: { ttlSeconds?: number } = {},
): Promise<{ ok: boolean; commandCount: number }> {
  const client = await getRedisClient();
  if (!client) return { ok: false, commandCount: 0 };

  // Strip della weekly sparkline dal payload hot: è master data semi-statico
  // che ora vive in prices_coins (letto dalle card via DB), non serve in
  // Redis. Toglierla alleggerisce la chiave (≈21 numeri × N coin) → meno
  // egress Upstash ad ogni tick del cron (1/min).
  const payload: HotPricesPayload = {
    updatedAt: Date.now(),
    quotes: Object.fromEntries(
      Array.from(quotes, ([k, q]) => [k, { ...q, sparkline7d: null }]),
    ),
  };
  // Clamp difensivo: niente sotto 30s (cron piu' fitto del previsto =
  // ok ma TTL minimo) e niente sopra 1h (sopra non ha senso, vorrebbe
  // dire cron non gira affatto).
  const ttl = Math.min(
    Math.max(opts.ttlSeconds ?? DEFAULT_HOT_PRICES_TTL_SECONDS, 30),
    3600,
  );

  try {
    await client.set(HOT_PRICES_KEY, payload, { ex: ttl });
    return { ok: true, commandCount: 1 };
  } catch (err) {
    console.warn("[prices/hot] setHotPrices failed:", err);
    return { ok: false, commandCount: 0 };
  }
}

/**
 * Legge lo snapshot da Redis. Ritorna null se Redis non configurato,
 * chiave assente (TTL scaduto), o errore di rete.
 *
 * Il caller fa fallback su `prices_data` DB se null. Coerenza: durante
 * la transition PR2→PR3 i due layer hanno lo STESSO contenuto (dual-
 * write), quindi il fallback non degrada la UX.
 */
export async function getHotPrices(): Promise<HotPricesPayload | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const data = await client.get<HotPricesPayload>(HOT_PRICES_KEY);
    if (!data || typeof data !== "object" || !data.quotes) return null;
    return data;
  } catch (err) {
    console.warn("[prices/hot] getHotPrices failed:", err);
    return null;
  }
}

/**
 * Convenience: lettura di un singolo coin. Sotto al cofano fa una sola
 * GET batched (l'intera mappa) — il caller che richiede 1 prezzo paga
 * lo stesso costo Upstash di chi ne richiede 500. Trascurabile data la
 * dimensione del JSON.
 */
export async function getHotPriceForSymbol(
  symbol: string,
): Promise<PriceQuote | null> {
  const data = await getHotPrices();
  if (!data) return null;
  return data.quotes[symbol.toUpperCase()] ?? null;
}

/**
 * Lookup batched per N symbol. Single GET, filter in-process.
 */
export async function getHotPricesForSymbols(
  symbols: string[],
): Promise<Map<string, PriceQuote>> {
  const result = new Map<string, PriceQuote>();
  if (symbols.length === 0) return result;
  const data = await getHotPrices();
  if (!data) return result;
  for (const s of symbols) {
    const upper = s.toUpperCase();
    const q = data.quotes[upper];
    if (q) result.set(upper, q);
  }
  return result;
}
