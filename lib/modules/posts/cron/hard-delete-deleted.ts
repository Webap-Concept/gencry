// lib/modules/posts/cron/hard-delete-deleted.ts
//
// Hard-delete dei post soft-deleted oltre il grace period (default 7gg).
// Il delete utente popola `posts.deleted_at`; entro la finestra di
// grazia un moderatore può ripristinarlo via /admin/modules/posts/deleted.
// Dopo la grazia, questo cron rimuove la riga in modo permanente.
//
// CASCADE su FK: posts_media, posts_reactions, posts_comments,
// posts_bookmarks, posts_reports, posts_tickers, posts_mentions,
// posts_outbox vengono ripuliti automaticamente.
//
// NOTA file storage: i file R2 dei `posts_media` cancellati restano
// orfani. Sono raccolti dal cron `orphan-media-cleanup` perché la sua
// query include anche i file il cui post_id è ora NULL (post cancellato
// via CASCADE è equivalente). Niente lavoro extra qui.
//
// Retention configurabile via `modules.posts.deleted_grace_days`
// (default 7). Batched per evitare lock di tabella prolungati.
import "server-only";

import { and, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { posts, postsCronRuns } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";

const BATCH_LIMIT = 500;
const KIND = "deleted_hard_delete";

export type DeletedHardDeleteResult = {
  ok: boolean;
  itemsProcessed: number;
  durationMs: number;
  error?: string;
};

export async function runDeletedHardDelete(): Promise<DeletedHardDeleteResult> {
  const startedAt = new Date();
  const [runRow] = await db
    .insert(postsCronRuns)
    .values({ kind: KIND, startedAt })
    .returning({ id: postsCronRuns.id });

  try {
    const settings = await getAppSettings();
    const graceDays =
      parseInt(settings["modules.posts.deleted_grace_days"], 10) || 7;
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

    // DELETE in batch usando subquery con LIMIT (Postgres non supporta
    // DELETE ... LIMIT direttamente). RETURNING ci dà il count effettivo.
    const deleted = await db.execute(sql`
      DELETE FROM ${posts}
      WHERE id IN (
        SELECT id FROM ${posts}
        WHERE ${posts.deletedAt} IS NOT NULL
          AND ${posts.deletedAt} < ${cutoff}
        ORDER BY ${posts.deletedAt} ASC
        LIMIT ${BATCH_LIMIT}
      )
      RETURNING id
    `);
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
      .where(
        and(sql`${postsCronRuns.id} = ${runRow.id}`, isNotNull(postsCronRuns.id)),
      );

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
  }
}
