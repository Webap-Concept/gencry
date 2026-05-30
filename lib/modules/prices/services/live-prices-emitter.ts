import "server-only";
// lib/modules/prices/services/live-prices-emitter.ts
//
// Emette i prezzi aggiornati via Upstash Realtime (SSE) dopo ogni sync.
// Chiamato da runPricesSync con fire-and-forget: un errore qui non
// interrompe il cron.
//
// Fail-open: se Redis non è configurato, se il toggle è OFF, o se
// l'emit fallisce → ritorna silenziosamente. Mai throw.
//
// Canale: "prices", evento: "update"
// Payload: { updatedAt: number, quotes: Record<symbol, { price, change24h, volume24h }> }

import { Realtime } from "@upstash/realtime";
import { getRedisClient } from "@/lib/kv/sdk";
import { pricesLiveSchema } from "./live-prices-schema";
import type { PriceQuote } from "../types";

export interface LivePriceQuote {
  price: number;
  change24h: number | null;
  volume24h: number | null;
}

export interface LivePricesPayload {
  updatedAt: number;
  quotes: Record<string, LivePriceQuote>;
}

export const LIVE_PRICES_CHANNEL = "prices";
export const LIVE_PRICES_EVENT   = "update";

/**
 * Emette snapshot prezzi su Upstash Realtime (canale "prices", evento "update").
 * No-op se `enabled=false` o se Redis non è configurato.
 */
export async function emitLivePrices(
  quotes: Map<string, PriceQuote>,
  enabled: boolean,
): Promise<void> {
  if (!enabled || quotes.size === 0) return;

  const redis = await getRedisClient();
  if (!redis) return;

  const realtime = new Realtime({ redis, schema: pricesLiveSchema });

  const payload: LivePricesPayload = {
    updatedAt: Date.now(),
    quotes: Object.fromEntries(
      Array.from(quotes.entries()).map(([sym, q]) => [
        sym,
        {
          price:     q.price,
          change24h: q.change24h,
          volume24h: q.volume24h,
        },
      ]),
    ),
  };

  try {
    await realtime.channel(LIVE_PRICES_CHANNEL).emit(LIVE_PRICES_EVENT, payload);
  } catch (err) {
    console.warn("[live-prices] emit failed (non-fatal):", err);
  }
}
