// lib/modules/prices/services/live-prices-schema.ts
//
// Schema Zod per i prezzi live (Upstash Realtime).
// Condiviso tra emitter (server) e route handler (SSE).
// Separato per evitare import circolari.

import { z } from "zod";

export const pricesLiveSchema = {
  update: z.object({
    updatedAt:  z.number(),
    quotes: z.record(
      z.string(),
      z.object({
        price:     z.number(),
        change24h: z.number().nullable(),
        volume24h: z.number().nullable(),
      }),
    ),
  }),
};

export type PricesLiveSchema = typeof pricesLiveSchema;
