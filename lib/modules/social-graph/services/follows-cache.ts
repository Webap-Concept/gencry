// lib/modules/social-graph/services/follows-cache.ts
//
// 3-layer cache per il "following set" di un viewer — l'insieme degli
// userId che il viewer segue. Hot path: feed Home (following-first +
// discovery fill), gate visibility 'followers' sui post embed, calcolo
// "viewer segue autore?" per i bottoni Follow nelle PostCard.
//
// Pattern allineato a `lib/modules/posts/services/blocks.ts` (block set):
//   L0 React.cache    → 1 sola esecuzione per request RSC anche con N caller.
//   L1 Map TTL 30s    → assorbe i picchi nello stesso lambda warm.
//   L2 Upstash 5min   → stale-tollerabile (un follow appena fatto vede
//                        l'aggiornamento istantaneo grazie a L1 + invalidate).
//   L3 DB             → fallback su miss totale, o se Upstash non configurato.
//
// Safe defaults: ogni errore (KV down, network, parse) → Set vuoto, mai
// throw. Conservativo per il feed Home (mostra solo discovery quando il
// set non si carica, mai un crash).
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { getRedisClient } from "@/lib/kv/sdk";

const KV_KEY_PREFIX = "social-graph:following:user:";
const KV_TTL_SECONDS = 5 * 60;
const LOCAL_TTL_MS = 30_000;
const LOCAL_CAP = 500;

type LocalEntry = { value: ReadonlySet<string>; expiry: number };
const localFollowingCache = new Map<string, LocalEntry>();

function kvKey(followerId: string): string {
  return `${KV_KEY_PREFIX}${followerId}`;
}

function localGet(followerId: string): ReadonlySet<string> | null {
  const now = Date.now();
  const hit = localFollowingCache.get(followerId);
  if (!hit) return null;
  if (now >= hit.expiry) {
    localFollowingCache.delete(followerId);
    return null;
  }
  return hit.value;
}

function localSet(followerId: string, value: ReadonlySet<string>): void {
  if (localFollowingCache.size >= LOCAL_CAP) {
    const now = Date.now();
    for (const [k, entry] of localFollowingCache) {
      if (now >= entry.expiry) localFollowingCache.delete(k);
    }
    if (localFollowingCache.size >= LOCAL_CAP) {
      const firstKey = localFollowingCache.keys().next().value;
      if (firstKey) localFollowingCache.delete(firstKey);
    }
  }
  localFollowingCache.set(followerId, {
    value,
    expiry: Date.now() + LOCAL_TTL_MS,
  });
}

async function loadFromDb(followerId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT followed_id AS id
      FROM user_follows
     WHERE follower_id = ${followerId}
  `);
  const list = Array.isArray(rows)
    ? (rows as Array<{ id: string }>)
    : ((rows as { rows?: Array<{ id: string }> }).rows ?? []);
  return list.map((r) => r.id);
}

/**
 * Carica il Set degli id seguiti dal viewer applicando i 3 layer.
 * Idempotente, never-throw: se Upstash o DB falliscono → Set vuoto + warn.
 * React.cache wrap → 1 sola call per request RSC.
 */
export const getFollowingSet = cache(
  async (followerId: string): Promise<ReadonlySet<string>> => {
    const local = localGet(followerId);
    if (local) return local;

    const k = kvKey(followerId);
    const client = await getRedisClient();

    if (client) {
      try {
        const hit = await client.get<string[]>(k);
        if (Array.isArray(hit)) {
          const set = new Set(hit);
          localSet(followerId, set);
          return set;
        }
      } catch (err) {
        console.warn("[social-graph:cache] read miss-on-error", {
          followerId,
          err: String(err),
        });
      }
    }

    let ids: string[] = [];
    try {
      ids = await loadFromDb(followerId);
    } catch (err) {
      console.warn(
        "[social-graph:cache] db fallback failed — returning empty set",
        { followerId, err: String(err) },
      );
      const empty = new Set<string>();
      localSet(followerId, empty);
      return empty;
    }

    const set = new Set(ids);
    localSet(followerId, set);

    if (client) {
      try {
        await client.set(k, ids, { ex: KV_TTL_SECONDS });
      } catch (err) {
        console.warn("[social-graph:cache] write failed", {
          followerId,
          err: String(err),
        });
      }
    }

    return set;
  },
);

/**
 * Invalida la chiave KV + L1 in-process per uno specifico viewer.
 * Il follow è directed: chi cambia stato di follow è solo `followerId`.
 * `followedId` NON ha cache su questo Set (il suo Set è "chi io seguo",
 * non viene impattato), quindi una sola invalidate basta.
 *
 * Idempotente, never-throw.
 */
export async function invalidateFollowingSet(
  followerId: string,
): Promise<void> {
  localFollowingCache.delete(followerId);
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(kvKey(followerId));
  } catch (err) {
    console.warn("[social-graph:cache] invalidate failed", {
      followerId,
      err: String(err),
    });
  }
}

/**
 * Test helper: svuota la cache in-process (L1). Non tocca Upstash.
 * Usato da vitest per garantire isolamento tra test.
 */
export function __resetLocalFollowingCacheForTests(): void {
  localFollowingCache.clear();
}
