// lib/modules/notifications/notification-targets.ts
//
// Mappa (type, payload) → destinazione di navigazione e summary i18n
// per ogni evento. Single source of truth — riusato da NotificationItem
// (click → router.push) e dall'eventuale email digest (PR-3) per il
// deep-link in body.
//
// Sync con il trigger plpgsql `notifications_fanout_from_outbox` di
// M_notifications_001 e con la const `NOTIFICATION_TYPES` dello schema.
// Aggiungere un tipo richiede sync in 3 punti (vedi caveat in
// /admin/modules/notifications/architecture).
import type { NotificationType, PostReactionKind } from "@/lib/db/schema";
import { POST_REACTION_KINDS } from "@/lib/db/schema";

export type NotificationTarget = {
  /** Path interno per <Link href>. Usa hash quando navighiamo al commento. */
  href: string;
  /** Chiave i18n del summary da `notifications.types.*` (nested path). */
  summaryKey: NotificationType;
  /** Reaction kind dal payload, per render icona SVG inline. null se non
   *  applicabile (tipo non reaction-based) o payload non contiene reaction. */
  reactionKind: PostReactionKind | null;
  /** Preview del body del post (max 100 char) arricchita dal trigger
   *  M_notifications_002. null se notifica pre-002 o post deleted. */
  postPreview: string | null;
  /** Preview del body del commento (max 100 char) per i tipi comment.*. */
  commentPreview: string | null;
};

type AnyPayload = Record<string, unknown>;

function str(p: AnyPayload, key: string): string | undefined {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
}

function reactionFromPayload(payload: AnyPayload): PostReactionKind | null {
  const raw = str(payload, "reaction");
  if (!raw) return null;
  return (POST_REACTION_KINDS as readonly string[]).includes(raw)
    ? (raw as PostReactionKind)
    : null;
}

export function resolveNotificationTarget(
  type: string,
  postId: string | null,
  commentId: string | null,
  payload: AnyPayload,
): NotificationTarget | null {
  const postPreview = str(payload, "post_preview") ?? null;
  const commentPreview = str(payload, "comment_preview") ?? null;

  switch (type as NotificationType) {
    case "post.reaction.added": {
      if (!postId) return null;
      return {
        href: `/post/${postId}`,
        summaryKey: "post.reaction.added",
        reactionKind: reactionFromPayload(payload),
        postPreview,
        commentPreview: null,
      };
    }
    case "post.comment.created": {
      if (!postId) return null;
      return {
        href: commentId
          ? `/post/${postId}#comment-${commentId}`
          : `/post/${postId}`,
        summaryKey: "post.comment.created",
        reactionKind: null,
        postPreview,
        commentPreview,
      };
    }
    case "post.comment.reaction.added": {
      if (!postId || !commentId) return null;
      return {
        href: `/post/${postId}#comment-${commentId}`,
        summaryKey: "post.comment.reaction.added",
        reactionKind: reactionFromPayload(payload),
        postPreview: null,
        commentPreview,
      };
    }
    case "post.mention": {
      if (!postId) return null;
      return {
        href: `/post/${postId}`,
        summaryKey: "post.mention",
        reactionKind: null,
        postPreview,
        commentPreview: null,
      };
    }
    case "post.repost.created": {
      // payload.post_id = id del NUOVO quote post (l'oggetto della notifica).
      // Naviga al quote post (più interessante: "chi mi ha citato e cosa
      // ha detto?"). post_preview qui è del quote (dal trigger).
      const quoteId = str(payload, "post_id") ?? postId;
      if (!quoteId) return null;
      return {
        href: `/post/${quoteId}`,
        summaryKey: "post.repost.created",
        reactionKind: null,
        postPreview,
        commentPreview: null,
      };
    }
    default:
      return null;
  }
}
