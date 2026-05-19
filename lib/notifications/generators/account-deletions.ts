// Generator: alert per ogni account in stato di soft-delete (grace period).
// Emette un candidato per utente con `users.deleted_at IS NOT NULL` la cui
// finestra di grace (ACCOUNT_DELETION_GRACE_DAYS) non e' ancora scaduta.
//
// Auto-resolve naturale via dispatcher:
// - admin annulla la richiesta -> deleted_at torna NULL -> niente candidato
// - cron `soft-deleted-purge` cancella la riga -> niente candidato
// - grace scaduta -> niente candidato (l'account e' considerato perso, il
//   purge fisico arrivera' col cron senza piu' bisogno di alert).

import { db } from "@/lib/db/drizzle";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account/deletion";
import { buildAdminPath } from "@/lib/admin-paths";
import { users } from "@/lib/db/schema";
import { and, isNotNull, sql } from "drizzle-orm";
import type {
  NotificationCandidate,
  NotificationGenerator,
  NotificationSeverity,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

type PendingDeletionRow = {
  id: string;
  email: string;
  deletedAt: Date;
};

function severityFor(daysRemaining: number): NotificationSeverity {
  if (daysRemaining <= 1) return "critical";
  if (daysRemaining <= 7) return "warning";
  return "info";
}

/**
 * Logica pura: dato l'elenco di utenti soft-deleted, ritorna i candidati.
 * Esposta per essere testata senza DB.
 *
 * `usersBaseLink` è il path admin RUNTIME (es. "/admincontrol/access/users").
 * Default `/admin/access/users` per backward-compat coi test che non lo
 * passano; in produzione il caller lo risolve via `buildAdminPath()` con
 * lo slug runtime.
 */
export function computeAccountDeletionCandidates(
  rows: PendingDeletionRow[],
  now = Date.now(),
  graceDays = ACCOUNT_DELETION_GRACE_DAYS,
  usersBaseLink = "/admin/access/users",
): NotificationCandidate[] {
  const out: NotificationCandidate[] = [];

  for (const row of rows) {
    const purgeAt = row.deletedAt.getTime() + graceDays * DAY_MS;
    const msRemaining = purgeAt - now;
    if (msRemaining <= 0) continue;

    const daysRemaining = Math.max(1, Math.ceil(msRemaining / DAY_MS));
    const purgeDate = new Date(purgeAt);

    out.push({
      type: "account_deletion_requested",
      severity: severityFor(daysRemaining),
      title: `Account deletion requested: ${row.email}`,
      body: `Purge scheduled in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} (${purgeDate.toISOString().slice(0, 10)}). Cancel from the user page if requested by mistake.`,
      link: `${usersBaseLink}/${row.id}?status=deletion_requested`,
      dedupKey: `account_deletion_requested:${row.id}`,
      metadata: {
        userId: row.id,
        email: row.email,
        deletedAt: row.deletedAt.toISOString(),
        purgeAt: purgeDate.toISOString(),
        // `purgeDate` come stringa YYYY-MM-DD per il rendering i18n
        // (placeholder semplice, niente Date interpolation lato client).
        purgeDate: purgeDate.toISOString().slice(0, 10),
        daysRemaining,
      },
    });
  }

  return out;
}

export const accountDeletionsGenerator: NotificationGenerator = {
  type: "account_deletion_requested",
  requiredPermission: "admin:users",
  run: async () => {
    // Filtro a livello SQL alle sole righe entro la grace per non scaricare
    // utenti gia' "scaduti" (in attesa del purge fisico) — sono comunque
    // ignorati lato compute, ma evitiamo il transfer.
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.deletedAt),
          sql`${users.deletedAt} > NOW() - (${ACCOUNT_DELETION_GRACE_DAYS} || ' days')::interval`,
        ),
      );

    const filtered = rows.filter(
      (r): r is PendingDeletionRow => r.deletedAt !== null,
    );
    const usersBaseLink = await buildAdminPath("/access/users");
    return computeAccountDeletionCandidates(
      filtered,
      Date.now(),
      ACCOUNT_DELETION_GRACE_DAYS,
      usersBaseLink,
    );
  },
};
