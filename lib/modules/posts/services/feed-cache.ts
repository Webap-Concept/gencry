// lib/modules/posts/services/feed-cache.ts
//
// Cache layer per le LISTE di post_id (timeline / Following / ticker /
// bookmark / mentions). Pattern: il consumer chiama getCachedFeedIds(key,
// fallback). Il service decide se servire da cache o eseguire `fallback()`
// e (eventualmente) popolarla.
//
// V1 = pass-through: zero cache, zero KV, fallback() viene SEMPRE chiamato.
// La separazione esiste comunque perché in V2 attiveremo KV `feed:{key}`
// TTL 60s + write-through senza toccare le query in PR-4.
//
// Quando attivare V2 (KV-backed)
//   - Following feed con followingIds.length > ~500 (IN-list che esplode)
//   - Discover loggato con p95 > 100ms
//   - Trending sorting (richiede materialized view o KV sorted set)
//
// Invalidation contracts (anche in V1, no-op):
//   - INSERT/DELETE post  → invalidateFeedCache('discover')
//   - INSERT post di autore X → invalidateFeedCache({ followersOf: X })
//   - Modifica ticker/mentions del post → invalidateFeedCache({ ticker: '...' })
//                                       e per ogni mentioned user
//   - Soft-delete/restore → invalidateFeedCache('discover') + author + ticker
import type { PostListPage } from "../types";

export type FeedCacheScope =
  | "discover"
  | { user: string }            // Following feed dell'utente
  | { followersOf: string }     // tutti i Following che includono X
  | { profile: string }         // /profile/{id} feed
  | { ticker: string }          // /feed?ticker=BTC
  | { mentionsOf: string }      // /profile/{id}/mentions
  | { bookmarksOf: string };    // /bookmarks personali

/**
 * Pattern cache-aside. V1 chiama sempre `fallback()`. V2 leggerà da KV e
 * popolerà al miss con write-through TTL configurabile.
 *
 * Firma cambiata 2026-05-16: prima ritornava solo `string[]` (gli ids),
 * costringendo il caller a un round-trip extra per ricostruire il
 * cursor → in V1 era impossibile sapere se c'erano altre pagine,
 * `nextCursor` finiva sempre null e l'infinite scroll si fermava
 * al primo batch. Ora restituiamo `PostListPage` completo (ids +
 * nextCursor) così V1 è funzionale e V2 può cachare l'intero payload.
 *
 * @param key      identificativo univoco della query (vedi feed-cache-keys
 *                 quando esisterà — per ora keys testuali generate dal
 *                 chiamante, es. "discover:cursor=null:limit=21")
 * @param fallback funzione che recupera la pagina dal DB
 */
export async function getCachedFeedIds(
  _key: string,
  fallback: () => Promise<PostListPage>,
): Promise<PostListPage> {
  return fallback();
}

/**
 * Invalidazione. In V1 no-op (niente da invalidare). In V2 cancellerà le
 * chiavi KV che matchano lo scope.
 *
 * Convenzione: SEMPRE chiamare dopo una mutation che potrebbe rendere
 * stale una lista, anche se in V1 non fa niente. Così quando attiveremo
 * il caching reale non dovremo cercare i call site.
 */
export async function invalidateFeedCache(_scope: FeedCacheScope): Promise<void> {
  // no-op v1
}
