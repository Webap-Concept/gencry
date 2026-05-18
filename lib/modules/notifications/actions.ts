"use server";
// lib/modules/notifications/actions.ts
//
// Server Actions del modulo notifications — write path. Le notifiche
// vengono CREATE dal trigger DB (M_notifications_001), il client può
// solo aggiornare il proprio `read_at`. Più una Server Action read-only
// `loadMoreNotificationsAction` usata dall'infinite scroll.
//
// RBAC: ogni action chiama getUser() e scrive SOLO sull'user corrente.
// Niente parametro userId nel write → impossibile cross-user write
// by design. La RLS SQL fa da seconda difesa (UPDATE policy = own).

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { notifications } from "@/lib/db/schema";
import {
  getMyNotifications,
  getNotificationByIdForViewer,
  type NotificationListItem,
} from "./queries";

export type NotificationsActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Marca una specifica notifica come letta. Idempotente: se già letta,
 * ritorna ok senza fare UPDATE. Nessun errore se la notifica non
 * appartiene al viewer (la WHERE filtra → 0 rows updated → ok silenzioso).
 */
export async function markNotificationAsRead(
  id: string,
): Promise<NotificationsActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "notifications.errors.unauthenticated" };

  await db
    .update(notifications)
    .set({ readAt: sql`NOW()` })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    );

  revalidatePath("/notifiche");
  return { ok: true };
}

/**
 * Marca TUTTE le notifiche non lette del viewer come lette. Usata
 * dalla page /notifiche al mount (debounced) per azzerare il badge
 * unread sidebar in 1 round-trip.
 */
export async function markAllNotificationsAsRead(): Promise<
  NotificationsActionResult<{ updated: number }>
> {
  const user = await getUser();
  if (!user) return { ok: false, error: "notifications.errors.unauthenticated" };

  const result = await db
    .update(notifications)
    .set({ readAt: sql`NOW()` })
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });

  revalidatePath("/notifiche");
  return { ok: true, data: { updated: result.length } };
}

/**
 * Server Action consumata dall'infinite scroll della lista notifiche.
 * Ritorna il prossimo batch keyset-paginato e il cursor successivo.
 */
export async function loadMoreNotificationsAction(input: {
  cursor: string | null;
  pageSize?: number;
}): Promise<
  NotificationsActionResult<{
    items: NotificationListItem[];
    nextCursor: string | null;
  }>
> {
  const user = await getUser();
  if (!user) return { ok: false, error: "notifications.errors.unauthenticated" };

  const page = await getMyNotifications({
    viewerUserId: user.id,
    cursor: input.cursor ?? undefined,
    pageSize: input.pageSize,
  });
  return { ok: true, data: { items: page.items, nextCursor: page.nextCursor } };
}

/**
 * Fetch hydratato di una singola notifica (actor + preview joinati).
 * Usata dal client realtime per arricchire la riga "spoglia" arrivata
 * via Postgres Changes — il broadcast non porta i join, qui li
 * recuperiamo in 1 round-trip.
 *
 * RBAC: doppio gate. Il viewer è preso da getUser() server-side; la
 * query interna filtra ulteriormente per user_id = viewer → impossibile
 * leggere notifiche di altri utenti anche forgiando l'id.
 */
export async function getNotificationByIdAction(
  id: string,
): Promise<NotificationsActionResult<{ item: NotificationListItem | null }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "notifications.errors.unauthenticated" };

  const item = await getNotificationByIdForViewer(id, user.id);
  return { ok: true, data: { item } };
}
