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
import type { NotificationType } from "@/lib/db/schema";

export type NotificationTarget = {
  /** Path interno per <Link href>. Usa hash quando navighiamo al commento. */
  href: string;
  /** Chiave i18n del summary da `modules.notifications.types.*`. */
  summaryKey: NotificationType;
  /**
   * Valori interpolati nel summary. `actor` viene sempre passato
   * separatamente dal caller (ha bisogno del username hydratato);
   * qui mettiamo SOLO i parametri estratti dal payload (es. reaction).
   */
  payloadParams: Record<string, string | number>;
};

type AnyPayload = Record<string, unknown>;

function str(p: AnyPayload, key: string): string | undefined {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
}

export function resolveNotificationTarget(
  type: string,
  postId: string | null,
  commentId: string | null,
  payload: AnyPayload,
): NotificationTarget | null {
  switch (type as NotificationType) {
    case "post.reaction.added": {
      if (!postId) return null;
      return {
        href: `/post/${postId}`,
        summaryKey: "post.reaction.added",
        payloadParams: { reaction: str(payload, "reaction") ?? "" },
      };
    }
    case "post.comment.created": {
      if (!postId) return null;
      return {
        href: commentId
          ? `/post/${postId}#comment-${commentId}`
          : `/post/${postId}`,
        summaryKey: "post.comment.created",
        payloadParams: {},
      };
    }
    case "post.comment.reaction.added": {
      if (!postId || !commentId) return null;
      return {
        href: `/post/${postId}#comment-${commentId}`,
        summaryKey: "post.comment.reaction.added",
        payloadParams: { reaction: str(payload, "reaction") ?? "" },
      };
    }
    case "post.mention": {
      if (!postId) return null;
      return {
        href: `/post/${postId}`,
        summaryKey: "post.mention",
        payloadParams: {},
      };
    }
    case "post.repost.created": {
      // payload.post_id = id del NUOVO quote post (l'oggetto della notifica).
      // payload.target_post_id = il mio post citato, riflesso in row.post_id.
      // Per la navigation puntiamo al QUOTE post (più interessante per il
      // recipient — "vai a vedere chi ti ha citato").
      const quoteId = str(payload, "post_id") ?? postId;
      if (!quoteId) return null;
      return {
        href: `/post/${quoteId}`,
        summaryKey: "post.repost.created",
        payloadParams: {},
      };
    }
    default:
      // Forward-compat: tipo sconosciuto al client → nessun target.
      // La UI mostrerà la riga senza link cliccabile.
      return null;
  }
}
