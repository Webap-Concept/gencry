// lib/modules/posts/services/post-cache.ts
//
// Cache layer per HYDRATION dei singoli post (PostCardData). Pattern usato
// dalle big app: timeline = solo ID (vedi feed-cache.ts), hydration =
// `getPostsByIds([...])` che cachea ogni post indipendentemente.
//
// V1 = pass-through: zero cache, fallback() viene SEMPRE chiamato.
// V2 = KV `post:{id}` TTL 5min cache-aside con batch get/set, invalidato
// su edit/soft-delete/counter-change "interessanti" (es. milestone counter
// cambia visibilmente).
//
// Note di design (per V2):
//   - Cachiamo SOLO la parte "core" del post (id, author, body, visibility,
//     timestamps, counters, media URLs). NON cachiamo `ownReaction` /
//     `bookmarked` che dipendono dall'utente viewer — quelli vanno query
//     per-user separata.
//   - L'invalidazione su counter è tricky: ogni reaction toggle invalidare
//     sembra costoso. Strategia: aggiornare la versione cached IN PLACE
//     (write-through) invece di invalidare, oppure tollerare drift di
//     pochi secondi (counter denormalizzati sono UX, non ledger).
import type { Post } from "@/lib/db/schema";

/**
 * Forma minima del post cacheato. Le query reali (PR-4) ritorneranno
 * un superset (con author info, media, ecc.) — questo type marca solo
 * cosa ci si aspetta di trovare in cache per il post stesso.
 *
 * Tenuto generico (`Post` da Drizzle) per ora: PR-4 raffinerà con un
 * `PostCardData` più ricco e separato dal layer DB.
 */
export type CachedPost = Post;

/**
 * Hydration batch con cache-aside. Il chiamante fornisce gli `ids` e una
 * `fallback(missingIds)` che fa la query DB per quelli non in cache.
 *
 * V1: chiama sempre `fallback(ids)` (cache vuota → tutti gli id sono miss).
 * V2: divide hit/miss da KV, chiama fallback solo per i miss, write-through
 *     dei nuovi al ritorno, preserva l'ordine richiesto.
 *
 * Idempotenza: l'ordine del risultato segue `ids`. Eventuali ID che non
 * esistono nel DB (es. cancellati) vengono semplicemente filtrati.
 */
export async function getCachedPosts(
  ids: string[],
  fallback: (missingIds: string[]) => Promise<CachedPost[]>,
): Promise<CachedPost[]> {
  if (ids.length === 0) return [];
  const fetched = await fallback(ids);
  // Mantieni l'ordine di `ids`: indispensabile per la coerenza del cursor
  // keyset. Senza questo il client vedrebbe i post mescolati.
  const byId = new Map(fetched.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

/**
 * Invalidazione di un singolo post. V1 no-op. Sempre chiamarla dopo:
 *   - editPost (body change)
 *   - softDeletePost / restorePost
 *   - se in futuro decideremo di invalidare anche su counter (oggi no)
 */
export async function invalidatePostCache(_postId: string): Promise<void> {
  // no-op v1
}

/**
 * Invalidazione batch (utile per cleanup massivi via cron o admin action).
 */
export async function invalidatePostCacheBatch(_postIds: string[]): Promise<void> {
  // no-op v1
}
