"use server";
// lib/modules/posts/ticker-preview-actions.ts
//
// Server Action per la preview del ticker mostrata nell'hover popover
// di PostBody. Ritorna lo snapshot del coin (se tracciato) + count
// dei post che lo menzionano nelle ultime 24h.
//
// Lazy: chiamata solo al primo hover, il client-side cacha in memory
// per evitare N+1 quando lo stesso $TICKER appare in più post visibili.

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { postsTickers } from "@/lib/db/schema";
import {
  getCoinForCard,
  type CoinView,
} from "@/lib/modules/prices/queries";

const TickerPreviewInputSchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z][A-Z0-9]{1,19}$/),
});

export type TickerPreviewData = {
  /** Snapshot del coin se tracciato in pricing, altrimenti null. */
  coin: CoinView | null;
  /** Post che menzionano il ticker nelle ultime 24h (tutte le visibility). */
  postCount24h: number;
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
    },
  };
}
