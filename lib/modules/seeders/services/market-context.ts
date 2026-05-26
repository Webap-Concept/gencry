// lib/modules/seeders/services/market-context.ts
//
// Market snapshot AL TIMESTAMP del post (non al "now"). Usato dal LLM
// generator per scrivere post coerenti col mercato di QUANDO il post
// finto e' "stato scritto" — es. un post di 18 giorni fa parla del
// BTC com'era 18 giorni fa, non com'e' oggi.
//
// Output: top 5 coin per market_cap_rank con:
//   - price al timestamp del post
//   - change_24h al timestamp del post (vs 24h prima)
//
// Performance: 1 SELECT su prices_history range-filtered (~26h finestra
// totale per coin), in-memory analisi. Per N=5 coin, ~1k row max.
// Cache 1 snapshot/giorno se serve in futuro, per ora pass-through.
import "server-only";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesHistory } from "@/lib/db/schema";

const TOP_N_COINS = 5;
const LOOKUP_WINDOW_HOURS = 26;

export interface MarketCoinAtTime {
  symbol: string;
  name: string;
  /** Prezzo al timestamp richiesto (null se la storia non copre quel periodo). */
  price: number | null;
  /** Variazione % 24h al timestamp richiesto (null se manca il punto t-24h). */
  change24h: number | null;
}

export interface MarketSnapshot {
  /** Timestamp ISO del momento "scattato" — riflesso nel prompt LLM. */
  atDate: string;
  coins: MarketCoinAtTime[];
}

/**
 * Top N coin attivi ordinati per market_cap_rank. Stesso pool che il
 * post-contributor usa come universe — coerente con i ticker che
 * possono finire nei post.
 */
async function getTopCoins(): Promise<Array<{ symbol: string; name: string }>> {
  return db
    .select({
      symbol: pricesCoins.symbol,
      name: pricesCoins.name,
    })
    .from(pricesCoins)
    .where(eq(pricesCoins.isActive, true))
    .orderBy(asc(pricesCoins.marketCapRank))
    .limit(TOP_N_COINS);
}

/**
 * Snapshot al timestamp dato. Per ogni coin del top N:
 *   1. Pesca il prezzo PIU' RECENTE <= `atDate` (within window 26h)
 *   2. Pesca il prezzo PIU' RECENTE <= `atDate - 24h`
 *   3. Calcola change24h = (priceAtDate - priceAt24hBefore) / priceAt24hBefore
 *
 * Note: se la storia non e' abbastanza profonda (es. coin nuova,
 * prices_history piatto), price o change24h ritornano null. Il prompt
 * LLM gestisce gracefully (skippa i null).
 */
export async function getMarketSnapshotAtDate(
  atDate: Date,
): Promise<MarketSnapshot> {
  const top = await getTopCoins();
  if (top.length === 0) {
    return { atDate: atDate.toISOString(), coins: [] };
  }

  const symbols = top.map((c) => c.symbol);
  const atMs = atDate.getTime();
  const dayBeforeMs = atMs - 24 * 60 * 60 * 1000;
  // Range: da 26h prima del t-24h, fino a `atDate` stesso. Cattura
  // entrambi i punti d'interesse in una sola query.
  const windowStart = new Date(dayBeforeMs - LOOKUP_WINDOW_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      symbol: pricesHistory.symbol,
      ts: pricesHistory.ts,
      price: pricesHistory.price,
    })
    .from(pricesHistory)
    .where(
      and(
        inArray(pricesHistory.symbol, symbols),
        gte(pricesHistory.ts, windowStart),
        lte(pricesHistory.ts, atDate),
      ),
    )
    .orderBy(pricesHistory.symbol, desc(pricesHistory.ts));

  // In-memory: per ogni symbol, scorri la lista DESC e trova:
  //   - priceAtDate    = primo punto con ts <= atDate (= prima riga, sono DESC)
  //   - priceAt24hBefore = primo punto con ts <= dayBeforeMs
  const bySymbol = new Map<string, Array<{ ts: Date; price: number }>>();
  for (const r of rows) {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push({ ts: r.ts, price: Number(r.price) });
    bySymbol.set(r.symbol, arr);
  }

  const coins: MarketCoinAtTime[] = top.map((c) => {
    const series = bySymbol.get(c.symbol) ?? [];
    let priceAtDate: number | null = null;
    let priceAt24hBefore: number | null = null;
    for (const point of series) {
      if (priceAtDate === null && point.ts.getTime() <= atMs) {
        priceAtDate = point.price;
      }
      if (priceAt24hBefore === null && point.ts.getTime() <= dayBeforeMs) {
        priceAt24hBefore = point.price;
        break; // entrambi trovati, stop
      }
    }
    const change24h =
      priceAtDate !== null && priceAt24hBefore !== null && priceAt24hBefore > 0
        ? ((priceAtDate - priceAt24hBefore) / priceAt24hBefore) * 100
        : null;
    return {
      symbol: c.symbol,
      name: c.name,
      price: priceAtDate,
      change24h,
    };
  });

  return { atDate: atDate.toISOString(), coins };
}

/**
 * Helper di formatting per il prompt LLM. Stringa compatta umana:
 *   "BTC $67,234 -1.2% | ETH $3,456 +0.8% | SOL $142 -3.4% | ..."
 *
 * I null sono skippati (non passiamo info incompleta al modello).
 */
export function formatSnapshotForPrompt(snapshot: MarketSnapshot): string {
  const parts: string[] = [];
  for (const c of snapshot.coins) {
    if (c.price === null) continue;
    const priceStr = c.price >= 1
      ? `$${c.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
      : `$${c.price.toFixed(4)}`;
    const changeStr = c.change24h !== null
      ? ` ${c.change24h >= 0 ? "+" : ""}${c.change24h.toFixed(1)}%`
      : "";
    parts.push(`${c.symbol} ${priceStr}${changeStr}`);
  }
  return parts.join(" | ");
}
