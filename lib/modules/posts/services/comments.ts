// lib/modules/posts/services/comments.ts
//
// Service astratto per i commenti ai post. Comments_count su `posts` viene
// aggiornato dal trigger DB (M_posts_002_triggers.sql) — qui ci occupiamo
// solo della tabella `posts_comments`.
//
// Edit window: l'autore può editare il body entro N minuti (configurabile
// via `modules.posts.edit_window_minutes`, default 10). Soft-delete: setta
// `deleted_at`; cascade da posts_comments → posts_outbox NON è gestito (i
// commenti cancellati non emettono evento di outbox).
//
// Hookable: V2 può aggiungere realtime broadcast del commento al canale
// `post:{id}:comments`, cache invalidation, ecc., senza toccare il consumer.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsComments, type PostComment } from "@/lib/db/schema";

const DEFAULT_BODY_MAX = 2000;

export type CreateCommentInput = {
  postId: string;
  authorId: string;
  body: string;
  parentCommentId?: string | null;
};

/**
 * Crea un commento. Lancia se body è vuoto o supera DEFAULT_BODY_MAX.
 * NB: i controlli di authorization (utente loggato, post esiste e visibile,
 * non è bannato) sono responsabilità del chiamante (Server Action di PR-3).
 */
export async function createComment(
  input: CreateCommentInput,
): Promise<PostComment> {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new Error("posts.comments.empty_body");
  }
  if (body.length > DEFAULT_BODY_MAX) {
    throw new Error("posts.comments.body_too_long");
  }

  const [inserted] = await db
    .insert(postsComments)
    .values({
      postId: input.postId,
      authorId: input.authorId,
      parentCommentId: input.parentCommentId ?? null,
      body,
    })
    .returning();

  return inserted;
}

/**
 * Edit del body. Permesso solo all'autore ed entro la finestra di edit
 * (passata in input — il chiamante la legge da `modules.posts.edit_window_minutes`).
 * Setta `edited_at` per esporre "modificato" in UI.
 *
 * Ritorna il commento aggiornato o `null` se l'edit non è applicabile
 * (commento non esiste, non autore, fuori finestra, già cancellato).
 */
export async function editComment(args: {
  commentId: string;
  authorId: string;
  body: string;
  editWindowMinutes: number;
}): Promise<PostComment | null> {
  const body = args.body.trim();
  if (body.length === 0) {
    throw new Error("posts.comments.empty_body");
  }
  if (body.length > DEFAULT_BODY_MAX) {
    throw new Error("posts.comments.body_too_long");
  }

  const [updated] = await db
    .update(postsComments)
    .set({ body, editedAt: sql`NOW()` })
    .where(
      and(
        eq(postsComments.id, args.commentId),
        eq(postsComments.authorId, args.authorId),
        isNull(postsComments.deletedAt),
        sql`${postsComments.createdAt} > NOW() - (${args.editWindowMinutes} * INTERVAL '1 minute')`,
      ),
    )
    .returning();

  return updated ?? null;
}

/**
 * Soft delete. Permesso all'autore (e in futuro a chi ha
 * modules:posts.moderate). Il trigger DB decrementerà comments_count
 * sulla transizione deleted_at NULL → NOT NULL.
 */
export async function softDeleteComment(args: {
  commentId: string;
  /**
   * ID dell'utente che richiede la delete. Se è l'autore va sempre OK.
   * Se è un moderatore, il chiamante deve aver già verificato la
   * permission `modules:posts.moderate` PRIMA di chiamare; qui non
   * controlliamo i ruoli per non accoppiare il service a RBAC.
   */
  requesterId: string;
  /** Se true, salta il check authorId (uso da admin moderation). */
  asModerator?: boolean;
}): Promise<{ deleted: boolean }> {
  const whereClauses = [
    eq(postsComments.id, args.commentId),
    isNull(postsComments.deletedAt),
  ];
  if (!args.asModerator) {
    whereClauses.push(eq(postsComments.authorId, args.requesterId));
  }

  const result = await db
    .update(postsComments)
    .set({ deletedAt: sql`NOW()` })
    .where(and(...whereClauses))
    .returning({ id: postsComments.id });

  return { deleted: result.length > 0 };
}
