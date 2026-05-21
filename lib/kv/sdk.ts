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
import { logRedisSdkCall } from "./instrumentation";

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

  const raw = new Redis({ url, token });
  const client = instrumentRedisClient(raw);
  _cached = { client, expiry: now + CLIENT_CACHE_TTL_MS };
  return client;
}

/**
 * Wrap del client SDK in un Proxy che logga ogni metodo invocato.
 * Conta 1 command per chiamata (allineato con il billing Upstash) salvo
 * per `pipeline()` / `multi()`: in quel caso il logging avviene quando
 * il caller chiama `.exec()` sul builder, contando come N comandi.
 * Vedi `lib/kv/instrumentation.ts` per il dettaglio.
 *
 * Performance: il Proxy è quasi free in V8 (~1µs per access). Lo
 * lasceremo finché serve diagnosticare il consumo Upstash.
 */
function instrumentRedisClient(raw: Redis): Redis {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      // Skip wrap di metodi non-comando (es. internal, options, etc.)
      const propStr = String(prop);
      if (propStr.startsWith("_") || propStr === "constructor") return value;
      return function (this: unknown, ...args: unknown[]) {
        const t0 = Date.now();
        const result = (value as (...a: unknown[]) => unknown).apply(
          target,
          args,
        );
        if (result instanceof Promise) {
          return result.then((r) => {
            logRedisSdkCall(propStr, args[0], Date.now() - t0);
            return r;
          });
        }
        // Metodi sync (es. `pipeline()` builder) → non logghiamo qui;
        // il logging avverrà al `.exec()` del builder che è async.
        return result;
      };
    },
  }) as Redis;
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
