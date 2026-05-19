// Upsert idempotente di una `NotificationCandidate` in `admin_notifications`.
//
// Estratto dal dispatcher per essere riusato da chi vuole pushare/refreshare
// una singola notifica senza far girare l'intera reconciliation (es. il
// modulo posts dopo un nuovo report → refresh inline del counter).
//
// Stessa semantica del dispatcher:
// - dedupKey nuova        → INSERT
// - dedupKey già attiva   → UPDATE descrittivo se severity/title/body/link cambiano
// - dedupKey dismissed    → no-op (rispetta scelta admin)
// - dedupKey resolved     → ri-attiva (la condizione e' tornata)

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { adminNotifications } from "@/lib/db/schema";
import type { NotificationCandidate } from "./types";

export async function upsertCandidate(
  c: NotificationCandidate,
  requiredPermission: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(adminNotifications)
    .where(eq(adminNotifications.dedupKey, c.dedupKey))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(adminNotifications).values({
      type: c.type,
      severity: c.severity,
      title: c.title,
      body: c.body ?? null,
      link: c.link ?? null,
      dedupKey: c.dedupKey,
      requiredPermission,
      metadata: c.metadata ?? {},
    });
    return;
  }

  const row = existing[0];

  if (row.dismissedAt !== null) {
    return;
  }

  if (row.resolvedAt !== null) {
    await db
      .update(adminNotifications)
      .set({
        type: c.type,
        severity: c.severity,
        title: c.title,
        body: c.body ?? null,
        link: c.link ?? null,
        metadata: c.metadata ?? {},
        requiredPermission,
        resolvedAt: null,
        readAt: null,
        snoozedUntil: null,
        createdAt: new Date(),
      })
      .where(eq(adminNotifications.id, row.id));
    return;
  }

  const needsUpdate =
    row.severity !== c.severity ||
    row.title !== c.title ||
    row.body !== (c.body ?? null) ||
    row.link !== (c.link ?? null);

  if (needsUpdate) {
    await db
      .update(adminNotifications)
      .set({
        severity: c.severity,
        title: c.title,
        body: c.body ?? null,
        link: c.link ?? null,
        metadata: c.metadata ?? {},
      })
      .where(eq(adminNotifications.id, row.id));
  }
}
