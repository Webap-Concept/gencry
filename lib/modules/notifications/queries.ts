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
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { notifications, type Notification } from "@/lib/db/schema";

export type NotificationListItem = Notification;

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

  const rows = await db
    .select()
    .from(notifications)
    .where(
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
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
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
