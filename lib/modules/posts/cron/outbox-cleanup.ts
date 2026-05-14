// lib/modules/posts/cron/outbox-cleanup.ts
//
// Job pg_cron giornaliero che cancella le row `posts_outbox` già
// processed dal consumer notifications (oggi: nessuno, perché modulo
// notifications non esiste ancora; quando arriverà, marcerà
// `processed_at = NOW()` dopo aver emesso la notifica corrispondente).
//
// Senza questo cron, la tabella cresce indefinitamente: ogni reaction/
// comment/mention/repost lascia una row. Su scale (1M eventi/anno)
// diventa rilevante per dimensione DB Supabase.
//
// Retention configurabile via `modules.posts.outbox_retention_days`
// (default 30). Idempotente: una seconda esecuzione vede solo i nuovi
// processed > retention.
import "server-only";

import { and, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsCronRuns, postsOutbox } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";

const BATCH_LIMIT = 5000;
const KIND = "outbox_cleanup";

export type OutboxCleanupResult = {
  ok: boolean;
  itemsProcessed: number;
  durationMs: number;
  error?: string;
};

export async function runOutboxCleanup(): Promise<OutboxCleanupResult> {
  const startedAt = new Date();
  const [runRow] = await db
    .insert(postsCronRuns)
    .values({ kind: KIND, startedAt })
    .returning({ id: postsCronRuns.id });

  try {
    const settings = await getAppSettings();
    const retentionDays =
      parseInt(settings["modules.posts.outbox_retention_days"], 10) || 30;
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    // DELETE in batch usando una subquery con LIMIT (Postgres non
    // supporta DELETE ... LIMIT direttamente). returning() ci dà il
    // count effettivo cancellato.
    const deleted = await db.execute(sql`
      DELETE FROM ${postsOutbox}
      WHERE id IN (
        SELECT id FROM ${postsOutbox}
        WHERE ${postsOutbox.processedAt} IS NOT NULL
          AND ${postsOutbox.processedAt} < ${cutoff}
        ORDER BY ${postsOutbox.processedAt} ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING id
    `);
    // postgres-js execute returning: deleted è un array di row con `id`.
    const processed = Array.isArray(deleted) ? deleted.length : 0;

    const durationMs = Date.now() - startedAt.getTime();
    await db
      .update(postsCronRuns)
      .set({
        finishedAt: new Date(),
        durationMs,
        itemsProcessed: processed,
        ok: true,
      })
      .where(and(sql`${postsCronRuns.id} = ${runRow.id}`, isNotNull(postsCronRuns.id)));

    return { ok: true, itemsProcessed: processed, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(postsCronRuns)
      .set({
        finishedAt: new Date(),
        durationMs,
        ok: false,
        error: message,
      })
      .where(sql`${postsCronRuns.id} = ${runRow.id}`);
    return {
      ok: false,
      itemsProcessed: 0,
      durationMs,
      error: message,
    };
  } finally {
    // No-op: il lt() era usato in tx originaria, ora la DELETE è inline.
    void lt; // keep import non-unused warning a bada se ts strict
  }
}
