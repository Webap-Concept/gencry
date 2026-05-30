// app/api/realtime/prices/route.ts
//
// SSE endpoint per i prezzi live (Upstash Realtime).
// Risponde a GET con uno stream SSE finché il client è connesso.
//
// Prerequisiti per abilitare:
//   - modules.prices.live_prices_enabled = true (toggle admin)
//   - Upstash Redis configurato (upstash_redis_rest_url + _token)
//   - Vercel Pro con Fluid Compute (Free plan timeout = 10s, troppo
//     corto per SSE: il client riconnetterebbe ogni 10s con burst Redis)
//
// maxDurationSecs = 270 (< 300s limite Vercel Fluid Compute) così
// la riconnessione avviene prima del timeout hard della piattaforma.
//
// Ritorna 503 se il toggle è OFF o Redis non configurato.

import { Realtime, handle } from "@upstash/realtime";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getRedisClient } from "@/lib/kv/sdk";
import { pricesLiveSchema } from "@/lib/modules/prices/services/live-prices-schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const settings = await getAppSettings();

  if (settings["modules.prices.live_prices_enabled"] !== "true") {
    return new Response("Live prices disabled", { status: 503 });
  }

  const redis = await getRedisClient();
  if (!redis) {
    return new Response("Redis not configured", { status: 503 });
  }

  const realtime = new Realtime({ redis, schema: pricesLiveSchema, maxDurationSecs: 270 });
  const handler = handle({ realtime });

  const response = await handler(request);
  return response ?? new Response("Bad request", { status: 400 });
}
