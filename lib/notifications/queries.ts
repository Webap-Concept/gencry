// Query di lettura/scrittura sulle notifiche admin, con filtraggio RBAC.

import "server-only";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { adminNotifications, type AdminNotification } from "@/lib/db/schema";
import { getUserPermissions } from "@/lib/rbac/can";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { cache } from "react";
import { serializeNotification, type ClientNotification } from "./serializers";

const SUPERADMIN_MARKER = "__superadmin__";

function buildPermissionFilter(permissions: Set<string>) {
  if (permissions.has(SUPERADMIN_MARKER)) return null; // niente filtro
  if (permissions.size === 0) return false; // nessun accesso
  return inArray(adminNotifications.requiredPermission, [...permissions]);
}

/**
 * Notifiche attive (non chiuse, non in snooze) visibili all'admin corrente.
 * Ordinate per data discendente. Limit 50 (per il bell).
 */
export async function listActiveNotifications(
  permissions: Set<string>,
): Promise<AdminNotification[]> {
  const permFilter = buildPermissionFilter(permissions);
  if (permFilter === false) return [];

  const now = new Date();
  const conditions = [
    isNull(adminNotifications.dismissedAt),
    isNull(adminNotifications.resolvedAt),
    or(
      isNull(adminNotifications.snoozedUntil),
      lte(adminNotifications.snoozedUntil, now),
    )!,
  ];
  if (permFilter !== null) conditions.push(permFilter);

  return db
    .select()
    .from(adminNotifications)
    .where(and(...conditions))
    .orderBy(desc(adminNotifications.createdAt))
    .limit(50);
}

export async function countUnreadActive(
  permissions: Set<string>,
): Promise<number> {
  const list = await listActiveNotifications(permissions);
  return list.filter((n) => n.readAt === null).length;
}

/**
 * Dati iniziali per il bell admin (Server -> Client). Date serializzate in
 * stringhe ISO per evitare problemi di passaggio attraverso i confini RSC.
 *
 * Argument-less + `cache()`: i due layout admin (root + protected) la
 * chiamano in cascata sulla stessa request, e con argomento esplicito
 * ognuno passava un `Set<string>` differente (per i super-admin si crea
 * un nuovo `Set(["__superadmin__"])` in ciascun layout) — la dedup di
 * cache() su argomenti reference-equal non scattava.
 *
 * Con argomento vuoto la dedup è automatica: la prima call DB serve
 * entrambi i layout. `getUser()` e `getUserPermissions()` sono già
 * cached, quindi anche la risoluzione dei permessi è zero query extra.
 */
export const getInitialBellData = cache(async (): Promise<{
  notifications: ClientNotification[];
  unreadCount: number;
}> => {
  const user = await getUser();
  if (!user) return { notifications: [], unreadCount: 0 };

  const permissions = user.isAdmin
    ? new Set<string>(["__superadmin__"])
    : await getUserPermissions(user);

  // Graceful fallback: this runs on every admin request via the root
  // layout, so a DB hiccup (statement_timeout, connection drop) used
  // to take the entire admin shell down. We log the error and return
  // an empty bell — the admin still works, the user just doesn't see
  // notifications until the next request refresh.
  try {
    const rows = await listActiveNotifications(permissions);
    const unreadCount = rows.filter((n) => n.readAt === null).length;
    return { notifications: rows.map(serializeNotification), unreadCount };
  } catch (err) {
    console.warn(
      "[getInitialBellData] listActiveNotifications failed, returning empty bell",
      err,
    );
    return { notifications: [], unreadCount: 0 };
  }
});

// ---------------------------------------------------------------------------
// Mutation (chiamate dalle Server Actions)
// ---------------------------------------------------------------------------

export async function markRead(id: string): Promise<void> {
  await db
    .update(adminNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(adminNotifications.id, id), isNull(adminNotifications.readAt)),
    );
}

export async function markAllRead(permissions: Set<string>): Promise<void> {
  const permFilter = buildPermissionFilter(permissions);
  if (permFilter === false) return;

  const conditions = [isNull(adminNotifications.readAt)];
  if (permFilter !== null) conditions.push(permFilter);

  await db
    .update(adminNotifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function snoozeNotification(
  id: string,
  days = 7,
): Promise<void> {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db
    .update(adminNotifications)
    .set({ snoozedUntil: until })
    .where(eq(adminNotifications.id, id));
}

export async function dismissNotification(id: string): Promise<void> {
  await db
    .update(adminNotifications)
    .set({ dismissedAt: new Date() })
    .where(eq(adminNotifications.id, id));
}

// ---------------------------------------------------------------------------
// Pagina /admin/notifications — storico completo con filtri
// ---------------------------------------------------------------------------

export type NotificationStatus =
  | "active"
  | "snoozed"
  | "dismissed"
  | "resolved"
  | "all";

export type NotificationFilter = {
  status?: NotificationStatus;
  type?: string;
};

export async function listAllNotifications(
  permissions: Set<string>,
  filter: NotificationFilter = {},
): Promise<AdminNotification[]> {
  const permFilter = buildPermissionFilter(permissions);
  if (permFilter === false) return [];

  const conditions = [];
  if (permFilter !== null) conditions.push(permFilter);

  const now = new Date();
  switch (filter.status ?? "active") {
    case "active":
      conditions.push(isNull(adminNotifications.dismissedAt));
      conditions.push(isNull(adminNotifications.resolvedAt));
      conditions.push(
        or(
          isNull(adminNotifications.snoozedUntil),
          lte(adminNotifications.snoozedUntil, now),
        )!,
      );
      break;
    case "snoozed":
      conditions.push(gt(adminNotifications.snoozedUntil, now));
      conditions.push(isNull(adminNotifications.dismissedAt));
      conditions.push(isNull(adminNotifications.resolvedAt));
      break;
    case "dismissed":
      conditions.push(isNotNull(adminNotifications.dismissedAt));
      break;
    case "resolved":
      conditions.push(isNotNull(adminNotifications.resolvedAt));
      break;
    case "all":
      break;
  }

  if (filter.type) {
    conditions.push(eq(adminNotifications.type, filter.type));
  }

  return db
    .select()
    .from(adminNotifications)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminNotifications.createdAt))
    .limit(200);
}
