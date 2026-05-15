"use server";
// lib/modules/posts/ticker-preview-actions.ts
//
// Server Action per la preview del ticker mostrata nell'hover popover
// di PostBody. Ritorna lo snapshot del coin (se tracciato) + count
// dei post che lo menzionano nelle ultime 24h.
//
// Due varianti:
//   - getTickerPreview(symbol)           → 1 ticker, usata come fallback
//                                          lazy quando non c'è prefetch
//   - getTickerPreviewBatch(symbols[])   → N ticker in parallelo, usata
//                                          dai Server Components per
//                                          prefetch SSR-side (zero
//                                          latenza sul primo hover)
//
// freshUntil server-driven: il payload include un timestamp epoch oltre
// il quale il client deve considerare i dati stale e rifare fetch.
// Allineato al cron prices (ogni 5min) + 30s margin + min 60s floor per
// evitare spam refetch quando il cron ritarda.

import { and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { postsTickers } from "@/lib/db/schema";
import {
  getCoinForCard,
  type CoinView,
} from "@/lib/modules/prices/queries";

const TICKER_REGEX = /^[A-Z][A-Z0-9]{1,19}$/;

const TickerPreviewInputSchema = z.object({
  ticker: z.string().min(1).max(20).regex(TICKER_REGEX),
});

// Cron prices sync interval. Allineato al manifest ("ogni 5 min").
// Se modifichi lo schedule nel manifest, allinea anche qui.
const PRICES_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const FRESH_UNTIL_MARGIN_MS = 30 * 1000;
const MIN_FRESHNESS_MS = 60 * 1000;

function computeFreshUntil(coin: CoinView | null): number {
  const now = Date.now();
  if (!coin) return now + MIN_FRESHNESS_MS;
  const lastUpdated = coin.lastUpdated.getTime();
  return Math.max(
    now + MIN_FRESHNESS_MS,
    lastUpdated + PRICES_SYNC_INTERVAL_MS + FRESH_UNTIL_MARGIN_MS,
  );
}

export type TickerPreviewData = {
  /** Snapshot del coin se tracciato in pricing, altrimenti null. */
  coin: CoinView | null;
  /** Post che menzionano il ticker nelle ultime 24h (tutte le visibility). */
  postCount24h: number;
  /** Epoch ms: il client cache deve considerare stale dopo questo
   *  istante. Calcolato server-side allineato al cron + min floor 60s. */
  freshUntil: number;
};

export type TickerPreviewResult =
  | { ok: true; data: TickerPreviewData }
  | { ok: false; error: string };

export async function getTickerPreview(
  ticker: string,
): Promise<TickerPreviewResult> {
  const parsed = TickerPreviewInputSchema.safeParse({ ticker });
  if (!parsed.success) {
    return { ok: false, error: "ticker_invalid" };
  }
  const symbol = parsed.data.ticker;

  // Parallel: coin snapshot + post count 24h.
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [coin, countRows] = await Promise.all([
    getCoinForCard(symbol),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(postsTickers)
      .where(
        sql`${postsTickers.ticker} = ${symbol} AND ${postsTickers.createdAt} >= ${cutoffIso}`,
      ),
  ]);

  return {
    ok: true,
    data: {
      coin,
      postCount24h: countRows[0]?.n ?? 0,
      freshUntil: computeFreshUntil(coin),
    },
  };
}

/**
 * Batch preview di N ticker in parallelo. Usata dai Server Components
 * per **prefetch SSR** dei ticker visibili nel feed: il client riceve la
 * mappa già popolata via prop e il primo hover è istantaneo (zero
 * round-trip).
 *
 * Performance: 2 query parallele (N getCoinForCard ognuna cached 60s,
 * + 1 query batched COUNT GROUP BY ticker). Niente N+1.
 */
export async function getTickerPreviewBatch(
  symbols: string[],
): Promise<Record<string, TickerPreviewData>> {
  // Dedup + validate (silently filter out invalid symbols).
  const unique = Array.from(
    new Set(
      symbols
        .map((s) => s.toUpperCase())
        .filter((s) => TICKER_REGEX.test(s)),
    ),
  );
  if (unique.length === 0) return {};

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [coins, countRows] = await Promise.all([
    Promise.all(unique.map((s) => getCoinForCard(s))),
    db
      .select({
        ticker: postsTickers.ticker,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(postsTickers)
      .where(
        and(
          inArray(postsTickers.ticker, unique),
          sql`${postsTickers.createdAt} >= ${cutoffIso}`,
        ),
      )
      .groupBy(postsTickers.ticker),
  ]);

  const countBySymbol = new Map(countRows.map((r) => [r.ticker, r.n]));
  const out: Record<string, TickerPreviewData> = {};
  for (let i = 0; i < unique.length; i++) {
    const symbol = unique[i];
    const coin = coins[i];
    out[symbol] = {
      coin,
      postCount24h: countBySymbol.get(symbol) ?? 0,
      freshUntil: computeFreshUntil(coin),
    };
  }
  return out;
}
