// lib/modules/posts/services/comment-reactions.ts
//
// Service astratto per le reazioni ai commenti (refactor M_posts_008,
// gemello di services/reactions.ts ma su posts_comment_reactions).
//
// I 5 contatori denormalizzati su `posts_comments` vengono aggiornati
// dal trigger DB `posts_comment_reactions_counter_trg` (definito in
// M_posts_008). L'outbox emit `post.comment.reaction.added` è generato
// da un trigger separato (`posts_comment_reactions_outbox_trg`).
//
// Hookable (vedi feedback_hookable_services): V2 può aggiungere cache
// invalidation, enqueue su QStash per fan-out notifiche, circuit-breaker
// senza che il chiamante (Server Action) cambi nulla.
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  postsCommentReactions,
  type PostReactionKind,
} from "@/lib/db/schema";

/**
 * Imposta `kind` come reaction unica dell'utente sul commento. Se
 * l'utente aveva una reaction diversa, viene rimossa atomicamente nella
 * stessa transaction (i counter su `posts_comments` si riequilibrano
 * via trigger DB: -1 sulla vecchia, +1 sulla nuova).
 *
 * Regola "1 user → 1 reaction per commento" enforced applicativamente
 * (stessa filosofia del service `reactions` per i post).
 */
export async function addCommentReaction(
  commentId: string,
  userId: string,
  kind: PostReactionKind,
): Promise<{ inserted: boolean }> {
  return await db.transaction(async (tx) => {
    await tx
      .delete(postsCommentReactions)
      .where(
        and(
          eq(postsCommentReactions.commentId, commentId),
          eq(postsCommentReactions.userId, userId),
          ne(postsCommentReactions.reaction, kind),
        ),
      );

    const inserted = await tx
      .insert(postsCommentReactions)
      .values({ commentId, userId, reaction: kind })
      .onConflictDoNothing({
        target: [
          postsCommentReactions.commentId,
          postsCommentReactions.userId,
          postsCommentReactions.reaction,
        ],
      })
      .returning({ commentId: postsCommentReactions.commentId });

    return { inserted: inserted.length > 0 };
  });
}

/**
 * Rimuove la reazione `kind` dell'utente sul commento. No-op se non
 * era presente. Ritorna `true` se la riga è stata effettivamente
 * rimossa.
 */
export async function removeCommentReaction(
  commentId: string,
  userId: string,
  kind: PostReactionKind,
): Promise<{ removed: boolean }> {
  const result = await db
    .delete(postsCommentReactions)
    .where(
      and(
        eq(postsCommentReactions.commentId, commentId),
        eq(postsCommentReactions.userId, userId),
        eq(postsCommentReactions.reaction, kind),
      ),
    )
    .returning({ commentId: postsCommentReactions.commentId });

  return { removed: result.length > 0 };
}
