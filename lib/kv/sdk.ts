// lib/kv/sdk.ts
//
// Client Upstash Redis basato su SDK `@upstash/redis`. È il **path
// raccomandato per i nuovi consumer**: type-safe ops, JSON auto-encode/
// decode, pipeline builder fluent, helper per sorted set/streams/json
// quando serviranno (use case roadmap: trending leaderboard, presence,
// ecc.).
//
// Convivono nel repo:
//   - `lib/kv/raw.ts`  → fetch-raw (REST API direct), usato dal legacy
//                       auth rate-limit + bloom filter. Niente refactor
//                       forzato: il legacy funziona, lo tocchiamo solo
//                       se avrà bisogno di feature SDK-specific.
//   - `lib/kv/sdk.ts`  → SDK (questo file), use case nuovi (prices
//                       cache, feed cache, post cache, rate-limit
//                       posts, trending, ...).
//
// Stesso endpoint, stesse credenziali (`upstash_redis_rest_url`/_token`
// globali — vedi project_modular_architecture §"Per-modulo vs globale").
import "server-only";

import { Redis } from "@upstash/redis";
import { getAppSettings } from "@/lib/db/settings-queries";

const CLIENT_CACHE_TTL_MS = 60_000;

let _cached: { client: Redis; expiry: number } | null = null;

/**
 * Invalidate il client cached (call after admin updates credentials
 * via `/services/redis`). Esportato anche da `lib/kv/raw.ts` per la
 * cache delle credenziali raw — chiamarli entrambi per safety.
 */
export function invalidateRedisClientCache(): void {
  _cached = null;
}

/**
 * Ritorna un client SDK pronto. Null se Upstash non è configurato.
 * Cache process-local TTL 60s: evita 1 read DB di getAppSettings per
 * ogni call, ma rispetta rotation entro 1 minuto.
 *
 * Il caller hookable DEVE controllare il null e degradare a
 * pass-through SENZA throw — un Upstash mancante non deve mai
 * rompere la query principale (vedi pattern in prices/queries.ts).
 */
export async function getRedisClient(): Promise<Redis | null> {
  const now = Date.now();
  if (_cached && now < _cached.expiry) return _cached.client;

  const settings = await getAppSettings();
  const url = settings.upstash_redis_rest_url?.trim();
  const token = settings.upstash_redis_rest_token?.trim();
  if (!url || !token) return null;

  const client = new Redis({ url, token });
  _cached = { client, expiry: now + CLIENT_CACHE_TTL_MS };
  return client;
}

/**
 * Convenience check per hookable services che vogliono short-circuit
 * SENZA istanziare il client. Stessa logica di `getRedisClient` ma
 * ritorna solo boolean.
 */
export async function isUpstashConfigured(): Promise<boolean> {
  const settings = await getAppSettings();
  return Boolean(
    settings.upstash_redis_rest_url && settings.upstash_redis_rest_token,
  );
}
