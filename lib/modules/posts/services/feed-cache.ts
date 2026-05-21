import "server-only";
// lib/modules/posts/services/feed-cache.ts
//
// Cache layer per le LISTE di post_id (timeline / Following / ticker /
// bookmark / mentions). Pattern: il consumer chiama getCachedFeedIds(key,
// fallback). Il service decide se servire da cache o eseguire `fallback()`
// e (eventualmente) popolarla.
//
// V2 = Upstash KV (write-through, TTL 60s). Implementazione attiva da
// 2026-05-17. Pattern cache-aside:
//   - getCachedFeedIds(key, fallback) → HIT: ritorna; MISS: fallback +
//     SET con TTL. Errori KV: log + fallback() trasparente (mai throw
//     verso il caller — un KV down non deve mai rompere la feed).
//   - invalidateFeedCache(scope) → SCAN+DEL pattern. Anche qui no-throw.
//
// Key namespace `posts:feed:<scope-prefix>:<...details>`:
//   - posts:feed:discover:<userId|anon>:<cursor>:<pageSize>
//   - posts:feed:profile:<authorId>:<viewerUserId|anon>:<cursor>:<pageSize>
//   - posts:feed:ticker:<symbol>:<viewerUserId|anon>:<cursor>:<pageSize>
//   - posts:feed:mentions:<targetUserId>:<viewerUserId|anon>:<cursor>:<pageSize>
//   - posts:feed:bookmarks:<viewerUserId>:<cursor>:<pageSize>
//
// Le prime pages (cursor="0") sono di gran lunga le più frequenti — è
// lì che il caching paga. Le pages successive sono cachate comunque
// (sicuro, hit rate basso ma TTL 60s naturalmente le scarta).
//
// Invalidation contracts:
//   - INSERT/DELETE post di X → invalidateFeedCache('discover') +
//                               invalidateFeedCache({ profile: X })
//   - Modifica ticker/mentions → invalidateFeedCache({ ticker }) per ogni
//                               ticker e { mentionsOf } per ogni mentioned
//   - Soft-delete/restore     → invalidateFeedCache('discover') + profile + ticker
//   - Bookmark toggle         → invalidateFeedCache({ bookmarksOf: viewer })
import type { PostListPage } from "../types";
import { getRedisClient } from "@/lib/kv/sdk";

export type FeedCacheScope =
  | "discover"
  | { user: string }            // Following feed dell'utente (alias di discover:<userId>)
  | { followersOf: string }     // tutti i Following che includono X (futuro)
  | { profile: string }         // /profile/{id} feed
  | { ticker: string }          // /feed?ticker=BTC
  | { mentionsOf: string }      // /profile/{id}/mentions
  | { bookmarksOf: string };    // /bookmarks personali

const KEY_PREFIX = "posts:feed:";
const TTL_SECONDS = 60;
/** Batch size per SCAN durante invalidate. 100 è il default raccomandato
 *  Upstash — bilancia roundtrip vs memoria server-side. */
const SCAN_BATCH = 100;

// ─── In-process feed cache ────────────────────────────────────────────────
//
// Dedupa i fan-out di getCachedFeedIds dentro lo stesso lambda warm. In
// Next dev/prod, una page-load del feed può triggerare 2-5 GET sulla
// stessa key (proxy + layout + parallel @modal slot + prefetch su hover
// di link interno). TTL 3s = invisibile in UX, copre la finestra del
// render + i prefetch immediati. Invalidazione: clear per glob pattern
// dentro `invalidateFeedCache` (write-through lambda-local).
//
// Cap a 200 entries per evitare memory leak su warm lambda long-running.
// Quando pieno, scarta le entry expired prima; se ancora pieno, scarta
// la più vecchia (FIFO sull'ordine d'inserimento Map).
//
// Vedi feedback_redis_consumer_optimization_pattern.md.
const LOCAL_TTL_MS = 3_000;
const LOCAL_CAP = 200;
const localFeedCache = new Map<
  string,
  { value: PostListPage; expiry: number }
>();

function localGet(k: string): PostListPage | null {
  const now = Date.now();
  const hit = localFeedCache.get(k);
  if (!hit) return null;
  if (now >= hit.expiry) {
    localFeedCache.delete(k);
    return null;
  }
  return hit.value;
}

function localSet(k: string, value: PostListPage): void {
  if (localFeedCache.size >= LOCAL_CAP) {
    // Sweep expired entries prima di scartare per FIFO.
    const now = Date.now();
    for (const [key, entry] of localFeedCache) {
      if (now >= entry.expiry) localFeedCache.delete(key);
    }
    if (localFeedCache.size >= LOCAL_CAP) {
      const firstKey = localFeedCache.keys().next().value;
      if (firstKey) localFeedCache.delete(firstKey);
    }
  }
  localFeedCache.set(k, { value, expiry: Date.now() + LOCAL_TTL_MS });
}

/** Convert un glob Upstash-pattern (`*`) in regex JS per il match locale. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
}

function localInvalidatePattern(pattern: string): void {
  const re = globToRegex(pattern);
  for (const k of localFeedCache.keys()) {
    if (re.test(k)) localFeedCache.delete(k);
  }
}

function namespacedKey(key: string): string {
  // Il caller passa già una key strutturata tipo "discover:anon:0:20".
  // Aggiungiamo solo il prefix per evitare collisioni con altri moduli.
  return `${KEY_PREFIX}${key}`;
}

/**
 * Pattern cache-aside. Se Upstash non è configurato (client null) o un
 * errore KV avviene, fallback diretto al DB senza throw — la feed deve
 * funzionare sempre.
 *
 * Payload cachato: `PostListPage` JSON (~2KB tipico). TTL 60s = staleness
 * accettabile (Twitter-pattern), invalidation write-through accorcia il
 * gap su mutation.
 */
export async function getCachedFeedIds(
  key: string,
  fallback: () => Promise<PostListPage>,
): Promise<PostListPage> {
  const k = namespacedKey(key);

  // L1: in-process cache (TTL 3s). Hit = 0 Redis cmd. Vedi commento al top.
  const local = localGet(k);
  if (local) return local;

  const client = await getRedisClient();
  if (!client) return fallback();

  try {
    const hit = await client.get<PostListPage>(k);
    if (hit && Array.isArray(hit.ids)) {
      localSet(k, hit);
      return hit;
    }
  } catch (err) {
    // KV down / corrotto / mismatch shape → fallback senza pollute il log
    // con stack — è informativo, non un errore applicativo.
    console.warn("[feed-cache] read miss-on-error", { key: k, err: String(err) });
  }

  const fresh = await fallback();
  // Cache write best-effort: se KV è down, ignoriamo l'errore.
  try {
    await client.set(k, fresh, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[feed-cache] write failed", { key: k, err: String(err) });
  }
  localSet(k, fresh);
  return fresh;
}

/**
 * Invalidate per scope. Converte lo scope strutturato in un pattern KV
 * e DEL puntuale via SCAN. Idempotente, no-throw. Su scope non ancora
 * implementati ('followersOf') è un no-op silenzioso.
 */
export async function invalidateFeedCache(scope: FeedCacheScope): Promise<void> {
  const patterns = scopeToPatterns(scope);
  if (patterns.length === 0) return;

  // L1 invalidation: clear le matching key dalla local cache PRIMA del
  // round-trip Redis. Lambda-local (non broadcast cross-lambda) ma sul
  // lambda che ha appena scritto è quello che serve di più.
  for (const pattern of patterns) localInvalidatePattern(pattern);

  const client = await getRedisClient();
  if (!client) return;

  for (const pattern of patterns) {
    try {
      await deleteByPattern(client, pattern);
    } catch (err) {
      console.warn("[feed-cache] invalidate failed", { pattern, err: String(err) });
    }
  }
}

function scopeToPatterns(scope: FeedCacheScope): string[] {
  if (scope === "discover") {
    return [`${KEY_PREFIX}discover:*`];
  }
  if ("user" in scope) {
    // Alias: la timeline dell'utente è la sua chiave discover:<userId>:*
    return [`${KEY_PREFIX}discover:${scope.user}:*`];
  }
  if ("profile" in scope) {
    return [`${KEY_PREFIX}profile:${scope.profile}:*`];
  }
  if ("ticker" in scope) {
    return [`${KEY_PREFIX}ticker:${scope.ticker.toUpperCase()}:*`];
  }
  if ("mentionsOf" in scope) {
    return [`${KEY_PREFIX}mentions:${scope.mentionsOf}:*`];
  }
  if ("bookmarksOf" in scope) {
    return [`${KEY_PREFIX}bookmarks:${scope.bookmarksOf}:*`];
  }
  // followersOf: il modulo follows non c'è ancora — niente cache da
  // invalidare. Quando arriverà, definiremo lo schema della key.
  return [];
}

/**
 * Iterativo SCAN + DEL per pattern. Su Upstash REST SCAN è O(N) sul
 * dataset matchante, batch SCAN_BATCH. Su alpha-scale (<100 user) il
 * totale è trascurabile; su scale futura valutare bookkeeping via Set
 * di tag-invalidation (vedi roadmap).
 */
async function deleteByPattern(
  client: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  pattern: string,
): Promise<number> {
  let cursor: string = "0";
  let deleted = 0;
  do {
    const result = (await client.scan(cursor, {
      match: pattern,
      count: SCAN_BATCH,
    })) as [string, string[]];
    const [next, keys] = result;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
    cursor = String(next);
  } while (cursor !== "0");
  return deleted;
}
