// lib/modules/posts/services/reactions.ts
//
// Service astratto per le reazioni ai post. I consumer (Server Actions in
// PR-3) chiamano queste funzioni invece di toccare Drizzle direttamente.
// L'impl V1 è thin: INSERT/DELETE su posts_reactions, i contatori
// denormalizzati su `posts` vengono aggiornati dal trigger DB definito in
// M_posts_002_triggers.sql.
//
// Hookable (vedi feedback_hookable_services): V2 può:
//   - aggiungere cache invalidation (post-cache TTL) dopo la scrittura
//   - enqueue su Upstash QStash per fan-out notifiche più aggressivo
//   - applicare circuit-breaking se il DB è saturo
// senza che il chiamante della Server Action debba cambiare nulla.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  postsReactions,
  type PostReactionKind,
} from "@/lib/db/schema";

/**
 * Aggiunge la reazione `kind` dell'utente `userId` al post `postId`.
 * Idempotente (PK su (post_id, user_id, reaction) + ON CONFLICT DO NOTHING).
 *
 * Ritorna `true` se è stata effettivamente inserita una nuova riga, `false`
 * se l'utente aveva già messo quella reazione (in tal caso il trigger NON
 * è scattato e il counter non è cambiato).
 */
export async function addReaction(
  postId: string,
  userId: string,
  kind: PostReactionKind,
): Promise<{ inserted: boolean }> {
  const result = await db
    .insert(postsReactions)
    .values({ postId, userId, reaction: kind })
    .onConflictDoNothing({
      target: [postsReactions.postId, postsReactions.userId, postsReactions.reaction],
    })
    .returning({ postId: postsReactions.postId });

  return { inserted: result.length > 0 };
}

/**
 * Rimuove la reazione `kind` dell'utente. No-op se non era presente.
 * Ritorna `true` se è stata rimossa effettivamente una riga.
 */
export async function removeReaction(
  postId: string,
  userId: string,
  kind: PostReactionKind,
): Promise<{ removed: boolean }> {
  const result = await db
    .delete(postsReactions)
    .where(
      and(
        eq(postsReactions.postId, postId),
        eq(postsReactions.userId, userId),
        eq(postsReactions.reaction, kind),
      ),
    )
    .returning({ postId: postsReactions.postId });

  return { removed: result.length > 0 };
}

/**
 * Convenience: toggle. Se l'utente aveva già la reazione la rimuove,
 * altrimenti la aggiunge. Ritorna lo stato finale.
 *
 * NB: non atomico fra check e write. Va bene per UI optimistic; la
 * unique constraint impedisce comunque inconsistenze (al massimo l'utente
 * vede un blip di stato che si rapidamente riallinea al refetch).
 */
export async function toggleReaction(
  postId: string,
  userId: string,
  kind: PostReactionKind,
): Promise<{ active: boolean }> {
  const removed = await removeReaction(postId, userId, kind);
  if (removed.removed) return { active: false };
  await addReaction(postId, userId, kind);
  return { active: true };
}

/**
 * Lista delle reazioni dell'utente per un singolo post (set di kinds).
 * Usato in hydration di un PostCardData per calcolare l'`ownReactions`.
 *
 * V1: query diretta (1 round trip). V2 potrà cacheare lato `post-cache`
 * o derivarla da un proiettore lato KV.
 */
export async function getUserReactionsForPost(
  postId: string,
  userId: string,
): Promise<PostReactionKind[]> {
  const rows = await db
    .select({ reaction: postsReactions.reaction })
    .from(postsReactions)
    .where(
      and(
        eq(postsReactions.postId, postId),
        eq(postsReactions.userId, userId),
      ),
    );
  return rows.map((r) => r.reaction as PostReactionKind);
}
