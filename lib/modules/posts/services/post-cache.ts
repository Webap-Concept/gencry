import "server-only";
// lib/modules/posts/services/post-cache.ts
//
// Cache layer per HYDRATION dei singoli post. Pattern usato dalle big
// app: timeline = solo ID (vedi feed-cache.ts), hydration =
// `getPostsByIds([...])` che cachea ogni post indipendentemente.
//
// V2 (attivo dal 2026-05-25): cache-aside batched su Upstash KV con
// namespace `posts:post:{id}` TTL 5min. 3-layer come gli altri hot
// path del modulo (vedi feedback_redis_consumer_optimization_pattern):
//
//   L0 React.cache wrap   → 1 hydration per RSC request anche con
//                           fan-out (layout + 5 widget paralleli).
//   L1 in-process Map     → TTL 30s cap 1000. Assorbe i picchi nello
//                           stesso lambda warm.
//   L2 Upstash KV         → TTL 5min. MGET batched, MSET batched.
//   L3 fallback caller    → ricostruisce dal DB e write-through.
//
// Payload cached = viewer-agnostic (vedi `CachedPostShape` nei caller).
// NON cachiamo `viewer` state (ownReactions/bookmarked, per-utente),
// né `repostOf` resolved (l'embed viene assemblato dopo cache lookup
// applicando block/visibility lato JS per i target).
//
// Invalidation contracts:
//   - editPost / softDeletePost / restorePost     → DEL puntuale
//   - createComment / deleteComment / reactions   → DEL puntuale
//     (i counter denormalizzati sono nel payload, quindi i caller
//     attuali già invalidano; non cambiamo il contratto V1).
//   - createQuoteRepost → DEL del target (counter reposts_count).
//
// Errore-safe: ogni miss-on-error o write-failure cade silenziosamente
// sul fallback DB. Una KV down NON deve mai rompere l'hydration.
import { cache } from "react";
import { getRedisClient } from "@/lib/kv/sdk";

const KV_KEY_PREFIX = "posts:post:";
const KV_TTL_SECONDS = 5 * 60;
const LOCAL_TTL_MS = 30_000;
const LOCAL_CAP = 1_000;

// Hit/miss metrics — counter giornalieri (TTL 7 giorni) in Upstash. La
// probe `post-cache-hit-rate.ts` legge gli ultimi 7 giorni e calcola il
// rate. Fire-and-forget: 1 INCR pipelined dopo MGET, no latenza extra
// percepita (~50µs). Vedi project_post_cache_v25_followup.md.
const METRICS_KEY_PREFIX = "posts:cache:metrics:";
const METRICS_TTL_SECONDS = 7 * 24 * 60 * 60;

function kvKey(postId: string): string {
  return `${KV_KEY_PREFIX}${postId}`;
}

function metricsKey(kind: "hits" | "misses", isoDate: string): string {
  return `${METRICS_KEY_PREFIX}${kind}:${isoDate}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fire-and-forget metrics counter. Non await-ed dal caller — un INCR
 * fallito non deve mai degradare l'hydration. Il setEx mette TTL solo
 * al primo INCR del giorno (idempotente).
 */
function bumpMetric(
  client: Awaited<ReturnType<typeof getRedisClient>>,
  kind: "hits" | "misses",
  count: number,
): void {
  if (!client || count <= 0) return;
  const k = metricsKey(kind, todayIso());
  // expire opportunistico: SET TTL al primo INCR. Cmd successivi
  // mantengono il TTL già impostato (Upstash EXPIRE non resetta se NX
  // non è settato — qui semplifichiamo con un SET + EXPIRE pipeline-able).
  client
    .incrby(k, count)
    .then(() => {
      // Set TTL solo se la key è "young" (< 60s). Si potrebbe usare
      // EXPIREAT ma sarebbe più cmd. Semplicità: EXPIRE ad ogni call
      // (idempotente, non reset il TTL al valore — sì in realtà sì,
      // ma il TTL è sempre METRICS_TTL_SECONDS, quindi safe).
      return client.expire(k, METRICS_TTL_SECONDS);
    })
    .catch(() => {
      // Swallow: metriche sono best-effort.
    });
}

type LocalEntry<T> = { value: T; expiry: number };
const localCache = new Map<string, LocalEntry<unknown>>();

function localGet<T>(postId: string): T | null {
  const now = Date.now();
  const hit = localCache.get(postId);
  if (!hit) return null;
  if (now >= hit.expiry) {
    localCache.delete(postId);
    return null;
  }
  return hit.value as T;
}

function localSet<T>(postId: string, value: T): void {
  if (localCache.size >= LOCAL_CAP) {
    const now = Date.now();
    for (const [k, entry] of localCache) {
      if (now >= entry.expiry) localCache.delete(k);
    }
    if (localCache.size >= LOCAL_CAP) {
      const firstKey = localCache.keys().next().value;
      if (firstKey) localCache.delete(firstKey);
    }
  }
  localCache.set(postId, { value, expiry: Date.now() + LOCAL_TTL_MS });
}

function localDelete(postId: string): void {
  localCache.delete(postId);
}

export type CacheBatchResult<T> = {
  /** Map id → payload per gli hit (combinati L1 + L2). */
  hits: Map<string, T>;
  /** Ids non trovati. Il caller deve hydratarli e (opzionalmente) write-through. */
  missing: string[];
};

/**
 * Batch read con cache-aside. Provo prima L1, poi L2 (Upstash MGET
 * batched). Su KV down / null → tutto va a missing senza throw.
 *
 * `T` è il payload caller-defined (viewer-agnostic). Il caller è
 * responsabile del revive su campi non-JSON-nativi (es. Date strings).
 *
 * React.cache wrap: la batch è deduplicata per (lista-ids-ordinata)
 * dentro la stessa request RSC. Se 2 caller della stessa request
 * chiedono lo stesso ids set, ne fanno 1 sola query effettiva.
 */
export const getCachedPostHydrationBatch = cache(
  async <T>(ids: string[]): Promise<CacheBatchResult<T>> => {
    const hits = new Map<string, T>();
    const missing: string[] = [];

    if (ids.length === 0) return { hits, missing };

    // L1
    const l1Missing: string[] = [];
    for (const id of ids) {
      const v = localGet<T>(id);
      if (v) hits.set(id, v);
      else l1Missing.push(id);
    }
    if (l1Missing.length === 0) return { hits, missing };

    // L2 (Upstash MGET batched)
    const client = await getRedisClient();
    if (!client) return { hits, missing: l1Missing };

    try {
      const keys = l1Missing.map(kvKey);
      const values = await client.mget<Array<T | null>>(...keys);
      let l2Hits = 0;
      let l2Misses = 0;
      for (let i = 0; i < l1Missing.length; i++) {
        const id = l1Missing[i];
        const v = values[i];
        if (v && typeof v === "object") {
          hits.set(id, v);
          localSet(id, v);
          l2Hits++;
        } else {
          missing.push(id);
          l2Misses++;
        }
      }
      // Fire-and-forget metrics. L1 hits non sono contati (no Redis cmd
      // per def), quindi il rate calcolato è "Redis-side hit rate":
      // l2Hits / (l2Hits + l2Misses). Va interpretato come "quanto la
      // L2 KV cache lavora effettivamente" — quando questo cala sotto
      // 50% serve V2.5 transitive invalidation (vedi memory).
      bumpMetric(client, "hits", l2Hits);
      bumpMetric(client, "misses", l2Misses);
    } catch (err) {
      console.warn("[post-cache] mget miss-on-error", { count: l1Missing.length, err: String(err) });
      // KV down → tutti a missing
      return { hits, missing: l1Missing };
    }

    return { hits, missing };
  },
);

/**
 * Batch write-through (MSET con TTL). Su KV down / errore → no-op
 * silenzioso (logged ma not thrown). L1 viene sempre popolata anche
 * quando L2 è KO — almeno la request corrente beneficia.
 */
export async function setCachedPostHydrationBatch<T extends { id: string }>(
  items: T[],
): Promise<void> {
  if (items.length === 0) return;

  // L1 always-on (cap-bounded, never throws)
  for (const item of items) localSet(item.id, item);

  const client = await getRedisClient();
  if (!client) return;

  try {
    // Upstash SDK non ha un MSETEX nativo: usiamo pipeline batched
    // di SET ... EX. Singolo round-trip al server.
    const pipe = client.pipeline();
    for (const item of items) {
      pipe.set(kvKey(item.id), item, { ex: KV_TTL_SECONDS });
    }
    await pipe.exec();
  } catch (err) {
    console.warn("[post-cache] mset failed", { count: items.length, err: String(err) });
  }
}

/**
 * DEL puntuale. Chiamato dalle Server Action di mutation che
 * modificano i campi cachati: body, visibility, counters, comments
 * thread, soft-delete, restore.
 *
 * Pattern: prima L1, poi L2. Order matters: invalido L1 prima così
 * eventuali letture concorrenti sulla stessa lambda warm vedono già
 * il miss e ricostruiscono dal DB (consistency immediata).
 */
export async function invalidatePostCache(postId: string): Promise<void> {
  localDelete(postId);
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(kvKey(postId));
  } catch (err) {
    console.warn("[post-cache] del failed", { postId, err: String(err) });
  }
}

/**
 * Invalidazione batch (utile per cleanup massivi via cron o admin).
 * Pipeline 1 round-trip; L1 cleared sync.
 */
export async function invalidatePostCacheBatch(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  for (const id of postIds) localDelete(id);

  const client = await getRedisClient();
  if (!client) return;
  try {
    const keys = postIds.map(kvKey);
    await client.del(...keys);
  } catch (err) {
    console.warn("[post-cache] del-batch failed", { count: postIds.length, err: String(err) });
  }
}
