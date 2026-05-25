// lib/modules/seeders/services/price-trend-analyzer.ts
//
// Helper per i contributors: classifica i coin attivi in base al loro
// movimento % recente. Usato dal posts-contributor per scegliere
// `{ticker}` in coerenza col mood dell'autore (un bullish parla di
// coin in crescita, un bearish di coin in calo).
//
// Zero dipendenze esterne: usa solo i dati in `prices_data` e
// `prices_history` del nostro DB. Calcoli in-process una volta per
// run del seeder (1 query, max 200 coin attivi).
import "server-only";

import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesData, pricesHistory } from "@/lib/db/schema";

export type CoinTrendBucket = "bullish" | "bearish" | "neutral";

export type CoinTrend = {
  symbol: string;
  /** Cambio % ultimi 7 giorni (null se storia insufficiente). */
  change7d: number | null;
  /** Cambio % ultimi 30 giorni (null se storia insufficiente). */
  change30d: number | null;
  /** Bucket derivato da change7d: bullish (≥+5%), bearish (≤-5%), neutral. */
  bucket: CoinTrendBucket;
};

const BULLISH_THRESHOLD = 5;
const BEARISH_THRESHOLD = -5;

/**
 * Carica i trend dei coin attivi. Per ogni coin:
 *   1. Prezzo corrente da `prices_data`
 *   2. Prezzo 7gg fa e 30gg fa dal `prices_history`
 *
 * Per i coin senza storia sufficiente: change% = null, bucket = neutral.
 *
 * Returnable result. Caller può fare lookup per symbol o filtrare per
 * bucket (bullish / bearish).
 */
export async function analyzeCoinTrends(): Promise<CoinTrend[]> {
  // Step 1: tutti i coin attivi con prezzo corrente.
  const current = await db
    .select({
      symbol: pricesData.symbol,
      price: pricesData.price,
    })
    .from(pricesData)
    .innerJoin(pricesCoins, eq(pricesCoins.symbol, pricesData.symbol))
    .where(eq(pricesCoins.isActive, true));

  if (current.length === 0) return [];

  const symbols = current.map((c) => c.symbol);
  const priceBySymbol = new Map(current.map((c) => [c.symbol, Number(c.price)]));

  // Step 2: prezzo storico più vicino al cutoff (>= cutoff, primo
  // ordinato ASC) per ogni symbol. Uso Postgres `DISTINCT ON (symbol)`:
  // la query ritorna ESATTAMENTE 1 row per symbol invece di tutta la
  // storia 7d/30d (pattern wasteful pre-2026-05-25: 174K rows/call al
  // posto di ~N row pari ai coin attivi). Audit egress confermato dal
  // pg_stat_statements del 25/05.
  //
  // Drizzle: `selectDistinctOn([col])` espone il pattern in modo tipato.
  // ORDER BY DEVE iniziare con la stessa column usata in DISTINCT ON
  // (constraint Postgres).
  const now = Date.now();
  const cutoff7dDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff30dDate = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [history7d, history30d] = await Promise.all([
    db
      .selectDistinctOn([pricesHistory.symbol], {
        symbol: pricesHistory.symbol,
        price: pricesHistory.price,
      })
      .from(pricesHistory)
      .where(
        and(
          inArray(pricesHistory.symbol, symbols),
          gte(pricesHistory.ts, cutoff7dDate),
        ),
      )
      .orderBy(pricesHistory.symbol, asc(pricesHistory.ts)),
    db
      .selectDistinctOn([pricesHistory.symbol], {
        symbol: pricesHistory.symbol,
        price: pricesHistory.price,
      })
      .from(pricesHistory)
      .where(
        and(
          inArray(pricesHistory.symbol, symbols),
          gte(pricesHistory.ts, cutoff30dDate),
        ),
      )
      .orderBy(pricesHistory.symbol, asc(pricesHistory.ts)),
  ]);

  // Adesso ogni array contiene direttamente 1 row per symbol — niente
  // più necessità del Map post-processing "firstAfter".
  const toMap = (rows: { symbol: string; price: string }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.symbol, Number(r.price));
    return m;
  };
  const price7dAgo = toMap(history7d);
  const price30dAgo = toMap(history30d);

  // Step 3: compute trend per ogni coin attivo.
  return symbols.map((symbol) => {
    const current = priceBySymbol.get(symbol);
    if (!current || !Number.isFinite(current) || current <= 0) {
      return { symbol, change7d: null, change30d: null, bucket: "neutral" as const };
    }
    const ref7d = price7dAgo.get(symbol);
    const ref30d = price30dAgo.get(symbol);
    const change7d = ref7d ? ((current - ref7d) / ref7d) * 100 : null;
    const change30d = ref30d ? ((current - ref30d) / ref30d) * 100 : null;

    let bucket: CoinTrendBucket = "neutral";
    if (change7d !== null) {
      if (change7d >= BULLISH_THRESHOLD) bucket = "bullish";
      else if (change7d <= BEARISH_THRESHOLD) bucket = "bearish";
    }
    return { symbol, change7d, change30d, bucket };
  });
}

/**
 * Risolve i placeholder `{ticker_trend_7d}` e `{ticker_trend_30d}` in
 * label umane italiane. Restituisce stringa vuota per change null.
 */
export function trendLabel(change: number | null): string {
  if (change === null) return "stabile";
  if (change >= 10) return "in forte crescita";
  if (change >= 5) return "in crescita";
  if (change >= 2) return "leggermente positivo";
  if (change <= -10) return "in forte calo";
  if (change <= -5) return "in calo";
  if (change <= -2) return "leggermente negativo";
  return "stabile";
}
