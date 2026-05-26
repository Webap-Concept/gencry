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
  /** Parametri extra da spreddare nel `t.rich()` call (es. {strike_number}
   *  per le moderation.*). Sono SEMPRE valori serializzabili — niente
   *  funzioni (i tag rich come `<actor>` restano gestiti dal consumer). */
  templateValues: Record<string, string | number>;
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
        templateValues: {},
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
        templateValues: {},
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
        templateValues: {},
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
        templateValues: {},
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
        templateValues: {},
      };
    }
    case "moderation.strike_received":
    case "moderation.strike_revoked": {
      // Niente deep-link interno: lo storico strike utente non è esposto
      // user-side in V1. Click → resta su /notifiche (href "#" = no-op).
      // Preview del contenuto incriminato dal payload (source_preview)
      // viene mostrato come postPreview/commentPreview a seconda del kind.
      const strikeNum = payload.strike_number;
      return {
        href: "#",
        summaryKey: type as NotificationType,
        reactionKind: null,
        postPreview:
          str(payload, "source_type") === "post"
            ? str(payload, "source_preview") ?? null
            : null,
        commentPreview:
          str(payload, "source_type") === "comment"
            ? str(payload, "source_preview") ?? null
            : null,
        // strike_number è interpolato in "...(totale: {strike_number}/3)".
        // Per strike_revoked il template non lo usa ma passiamo comunque
        // un valore safe (string vuota) per evitare MISSING_VALUE errors.
        templateValues: {
          strike_number:
            typeof strikeNum === "number"
              ? strikeNum
              : typeof strikeNum === "string"
                ? strikeNum
                : "",
        },
      };
    }
    case "moderation.banned":
      // Click → /banned (la page dedicata che spiega lo stato + ricorso).
      return {
        href: "/banned",
        summaryKey: "moderation.banned",
        reactionKind: null,
        postPreview: null,
        commentPreview: null,
        templateValues: {},
      };
    case "achievement.first_like": {
      // Achievement self-targeted: link al proprio post (vedere chi ha
      // reagito + tutti gli engagement). actor = NULL (sistema).
      if (!postId) return null;
      return {
        href: `/post/${postId}`,
        summaryKey: "achievement.first_like",
        reactionKind: null,
        postPreview,
        commentPreview: null,
        templateValues: {},
      };
    }
    case "achievement.post_viral_likes":
    case "achievement.post_viral_comments":
    case "achievement.post_viral_reposts": {
      if (!postId) return null;
      const totalRaw = payload.total_count;
      const total =
        typeof totalRaw === "number"
          ? totalRaw
          : typeof totalRaw === "string"
            ? totalRaw
            : "";
      return {
        href: `/post/${postId}`,
        summaryKey: type as NotificationType,
        reactionKind: null,
        postPreview,
        commentPreview: null,
        templateValues: { total_count: total },
      };
    }
    default:
      return null;
  }
}
