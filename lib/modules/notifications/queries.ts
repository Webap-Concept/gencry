// lib/modules/notifications/queries.ts
//
// Read path del modulo notifications. Pattern keyset cursor su
// (created_at, id) — stesso del modulo posts per consistency. Le
// notifiche sono SEMPRE filtrate per user_id = current viewer (la RLS
// SQL lo enforce, qui doppia difesa applicativa).
//
// Realtime (PR-3): la UI subscribe via Supabase Realtime su
// `notifications` filtrato per user_id. Aggiungiamo nuove righe in
// cima alla lista locale + bumpiamo lo unread counter senza refetch.

import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  notifications,
  posts,
  postsComments,
  userProfiles,
  type Notification,
} from "@/lib/db/schema";

export type NotificationActor = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

/** Item per la UI: notifica + actor hydratato (null se actor_id era NULL
 *  o se l'utente è stato eliminato — ON DELETE SET NULL su actor_id). */
export type NotificationListItem = Notification & {
  actor: NotificationActor | null;
};

export type NotificationsPage = {
  items: NotificationListItem[];
  nextCursor: string | null;
};

/**
 * Lista paginata delle notifiche del viewer, più recenti prima.
 * Cursor opaco encoded "<isoCreatedAt>|<id>" (stesso pattern feed
 * posts: tie-break per ordine stabile su righe con createdAt uguale).
 */
export async function getMyNotifications(opts: {
  viewerUserId: string;
  cursor?: string;
  pageSize?: number;
}): Promise<NotificationsPage> {
  const pageSize = opts.pageSize ?? 30;
  const cur = decodeCursor(opts.cursor);

  const rows = await selectNotificationsHydrated(
    and(
      eq(notifications.userId, opts.viewerUserId),
      cur
        ? or(
            lt(notifications.createdAt, cur.createdAt),
            and(
              eq(notifications.createdAt, cur.createdAt),
              lt(notifications.id, cur.id),
            ),
          )
        : undefined,
    ),
    pageSize + 1,
  );

  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  const items = sliced.map(rowToHydratedItem);
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
}

/**
 * Single-row lookup hydratato (actor + preview fallback). Usata dal
 * client realtime: quando Postgres Changes notifica un INSERT, il
 * payload broadcast NON contiene i campi joinati, quindi il client
 * chiama questa per ottenere l'item completo prima di renderizzare.
 *
 * Sicurezza: la WHERE include `user_id = viewer` → impossibile leggere
 * notifiche di altri utenti anche se si forgia l'id.
 */
export async function getNotificationByIdForViewer(
  id: string,
  viewerUserId: string,
): Promise<NotificationListItem | null> {
  const rows = await selectNotificationsHydrated(
    and(eq(notifications.id, id), eq(notifications.userId, viewerUserId)),
    1,
  );
  const row = rows[0];
  return row ? rowToHydratedItem(row) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Internal: query helper condivisa lista + single
// ─────────────────────────────────────────────────────────────────────────

const postsJ = alias(posts, "p");
const commentsJ = alias(postsComments, "c");

type HydratedRow = {
  id: string;
  userId: string;
  type: string;
  actorId: string | null;
  postId: string | null;
  commentId: string | null;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  actorUsername: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorAvatarUrl: string | null;
  postBody: string | null;
  commentBody: string | null;
};

async function selectNotificationsHydrated(
  whereClause: ReturnType<typeof and>,
  limit: number,
): Promise<HydratedRow[]> {
  return db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      actorId: notifications.actorId,
      postId: notifications.postId,
      commentId: notifications.commentId,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorUsername: userProfiles.username,
      actorFirstName: userProfiles.firstName,
      actorLastName: userProfiles.lastName,
      actorAvatarUrl: userProfiles.avatarUrl,
      // Fallback hydration: se il payload non ha preview (notifiche
      // pre-M_notifications_002 o futuri tipi senza preview), prendi
      // il body crudo dal post/commento collegato. Hidrato JS-side.
      postBody: postsJ.body,
      commentBody: commentsJ.body,
    })
    .from(notifications)
    .leftJoin(userProfiles, eq(userProfiles.userId, notifications.actorId))
    .leftJoin(postsJ, eq(postsJ.id, notifications.postId))
    .leftJoin(commentsJ, eq(commentsJ.id, notifications.commentId))
    .where(whereClause)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit) as Promise<HydratedRow[]>;
}

/** Tronca + collassa whitespace come il trigger M_notifications_002. */
function previewFromBody(body: string | null): string | null {
  if (!body) return null;
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 100 ? collapsed.slice(0, 100) : collapsed;
}

function rowToHydratedItem(r: HydratedRow): NotificationListItem {
  const payload = (r.payload ?? {}) as Record<string, unknown>;
  // Backfill preview se manca nel payload (notifiche pre-002).
  const payloadPostPreview =
    typeof payload.post_preview === "string" ? payload.post_preview : null;
  const payloadCommentPreview =
    typeof payload.comment_preview === "string"
      ? payload.comment_preview
      : null;
  const enrichedPayload = {
    ...payload,
    post_preview: payloadPostPreview ?? previewFromBody(r.postBody),
    comment_preview:
      payloadCommentPreview ?? previewFromBody(r.commentBody),
  };
  return {
    id: r.id,
    userId: r.userId,
    type: r.type,
    actorId: r.actorId,
    postId: r.postId,
    commentId: r.commentId,
    payload: enrichedPayload,
    readAt: r.readAt,
    createdAt: r.createdAt,
    actor: r.actorId
      ? {
          id: r.actorId,
          username: r.actorUsername,
          firstName: r.actorFirstName,
          lastName: r.actorLastName,
          avatarUrl: r.actorAvatarUrl,
        }
      : null,
  };
}

/**
 * Counter delle notifiche non lette per il badge sidebar. Index-only
 * scan grazie all'indice parziale `idx_notifications_user_unread`.
 * Cache implicita per request via React `cache()` se chiamato in RSC.
 */
export async function getUnreadNotificationsCount(
  viewerUserId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, viewerUserId),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Stato della queue per l'admin overview: backlog (outbox non
 * processato), totale notifiche oggi, totale unread aggregato.
 * Niente per-user — solo counts globali.
 */
export async function getNotificationsHealth(): Promise<{
  outboxBacklog: number;
  totalToday: number;
  totalUnread: number;
}> {
  const [backlog, today, unread] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS c FROM posts_outbox WHERE processed_at IS NULL
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS c FROM notifications
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS c FROM notifications WHERE read_at IS NULL
    `),
  ]);
  // postgres-js drizzle execute ritorna un array di righe.
  const rowCount = (r: unknown): number => {
    const rows = (r as { rows?: Array<{ c: number }> }).rows ?? (r as Array<{ c: number }>);
    return rows?.[0]?.c ?? 0;
  };
  return {
    outboxBacklog: rowCount(backlog),
    totalToday: rowCount(today),
    totalUnread: rowCount(unread),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cursor helpers (formato compatto isoDate|uuid)
// ─────────────────────────────────────────────────────────────────────────

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(
  cursor?: string,
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}
