// lib/modules/notifications/cron/retention-cleanup.ts
//
// Cron giornaliero che cancella le notifiche piu' vecchie di
// `modules.notifications.retention_days` (default 180gg). Pattern identico a
// `purgeStaleConsentRecords` (consent-ledger.ts): DELETE batched 5000/run con
// loop fino a 20 batch = max 100k row per esecuzione. Il backlog drena nei
// run successivi se ci sono piu' di 100k row da cancellare.
//
// Range valido per retention_days: [7, 3650]. Sotto a 7 e' pericoloso
// (data-loss accidentale a fronte di un mis-config); sopra a 3650 e'
// equivalente a "mai" (10 anni). Valori fuori range -> skip senza errore
// con motivo nel result.
//
// Idempotente: una seconda esecuzione vede solo righe nuove > retention.
// Non scrive runs log (consistente con consent-records-cleanup): il
// risultato e' loggato dal cron route e visibile in Supabase pg_cron logs.
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { getAppSettings } from "@/lib/db/settings-queries";

const BATCH_SIZE = 5_000;
const MAX_BATCHES = 20;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 3_650;
const DEFAULT_RETENTION_DAYS = 180;

export type RetentionCleanupResult = {
  ok: boolean;
  cutoffAt: string | null;
  deleted: number;
  /** True se il loop si e' fermato per cap MAX_BATCHES con ancora righe candidate. */
  hasMore: boolean;
  /** Reason del no-op, se applicable (per UI/log). */
  skipped?: "invalid_retention" | "out_of_range";
  durationMs: number;
  error?: string;
};

export async function runNotificationsRetentionCleanup(): Promise<RetentionCleanupResult> {
  const startedAt = Date.now();

  let retentionDays = DEFAULT_RETENTION_DAYS;
  try {
    const settings = await getAppSettings();
    const raw = settings["modules.notifications.retention_days"];
    const parsed = Number.parseInt(raw ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      retentionDays = parsed;
    }
  } catch (err) {
    console.error("[notifications/retention-cleanup] settings load failed:", err);
    return {
      ok: false,
      cutoffAt: null,
      deleted: 0,
      hasMore: false,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (retentionDays < MIN_RETENTION_DAYS || retentionDays > MAX_RETENTION_DAYS) {
    return {
      ok: true,
      cutoffAt: null,
      deleted: 0,
      hasMore: false,
      skipped: "out_of_range",
      durationMs: Date.now() - startedAt,
    };
  }

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

  let totalDeleted = 0;
  let batches = 0;
  let lastBatchSize = 0;

  try {
    do {
      // DELETE batched via PK uuid. ctid (puntatore fisico) è incompatibile
      // con il pooler Supabase in transaction mode: la subquery SELECT e il
      // DELETE possono finire su connessioni diverse → ctid non più valido →
      // query fallisce. La PK `id` è stabile tra connessioni.
      // L'indice idx_notifications_created_at_asc (M_007) copre la subquery.
      const result = await db.execute(sql`
        DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
          WHERE created_at < ${cutoff}
          ORDER BY created_at
          LIMIT ${BATCH_SIZE}
        )
      `);

      // postgres-js / pg / neon espongono rowCount con chiavi diverse.
      const r = result as unknown as {
        rowCount?: number;
        count?: number;
        length?: number;
      };
      lastBatchSize = r.rowCount ?? r.count ?? r.length ?? 0;
      totalDeleted += lastBatchSize;
      batches += 1;
    } while (lastBatchSize === BATCH_SIZE && batches < MAX_BATCHES);

    return {
      ok: true,
      cutoffAt: cutoff.toISOString(),
      deleted: totalDeleted,
      hasMore: lastBatchSize === BATCH_SIZE && batches >= MAX_BATCHES,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notifications/retention-cleanup] delete failed:", err);
    return {
      ok: false,
      cutoffAt: cutoff.toISOString(),
      deleted: totalDeleted,
      hasMore: false,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}
