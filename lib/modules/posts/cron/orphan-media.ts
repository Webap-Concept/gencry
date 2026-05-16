// lib/modules/posts/cron/orphan-media.ts
//
// Job pg_cron giornaliero che chiude il Caso B del MediaUploader: file
// uploadati su R2 + riga `posts_media` mai claim-ata a un post perché
// l'utente ha chiuso brutalmente la tab/browser prima del cleanup
// useEffect del React unmount.
//
// Strategy: SELECT i posts_media abbandonati (post_id NULL +
// created_at < now() - graceHours), per ogni → DELETE R2 best-effort +
// DELETE riga DB. Loggato in posts_cron_runs.
//
// Idempotente: una seconda esecuzione vede 0 orphan (le righe sono già
// state cancellate dal primo run) e termina senza side-effect.
//
// Batch LIMIT 500 per run: anche se l'orphan totale è migliaia, il
// cron daily completa entro pochi secondi; il giorno successivo
// processa il batch successivo. Evita HTTP timeout 30s pg_net e
// lock contention.
import "server-only";

import { and, asc, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsCronRuns, postsMedia } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  deletePostMediaObject,
  loadPostsR2Config,
  postMediaVariantKeys,
} from "@/lib/modules/posts/storage";

const BATCH_LIMIT = 500;
const KIND = "orphan_media_cleanup";

export type OrphanMediaResult = {
  ok: boolean;
  itemsProcessed: number;
  durationMs: number;
  error?: string;
};

export async function runOrphanMediaCleanup(): Promise<OrphanMediaResult> {
  const startedAt = new Date();
  const [runRow] = await db
    .insert(postsCronRuns)
    .values({ kind: KIND, startedAt })
    .returning({ id: postsCronRuns.id });

  try {
    const settings = await getAppSettings();
    const graceHours =
      parseInt(settings["modules.posts.orphan_media_grace_hours"], 10) || 24;
    const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000);

    const orphans = await db
      .select({
        id: postsMedia.id,
        storageKey: postsMedia.storageKey,
      })
      .from(postsMedia)
      .where(and(isNull(postsMedia.postId), lt(postsMedia.createdAt, cutoff)))
      .orderBy(asc(postsMedia.createdAt))
      .limit(BATCH_LIMIT);

    const r2Cfg = await loadPostsR2Config();

    let processed = 0;
    for (const o of orphans) {
      // Cancella tutte le possibili chiavi R2 associate: l'originale
      // (storage_key salvato) + le 2 varianti webp se erano già state
      // generate dal processor (asset confirmed_at != null). Best-effort,
      // niente throw — se un oggetto non c'è R2 ritorna 204 comunque.
      if (r2Cfg) {
        const { full, thumb } = postMediaVariantKeys(o.storageKey);
        await deletePostMediaObject(r2Cfg, o.storageKey);
        await deletePostMediaObject(r2Cfg, full);
        await deletePostMediaObject(r2Cfg, thumb);
      }
      // DELETE row. Filtro WHERE post_id IS NULL per safety: se nel
      // frattempo qualcuno ha claim-ato la row a un post, NON cancella.
      const res = await db
        .delete(postsMedia)
        .where(
          and(
            sql`${postsMedia.id} = ${o.id}`,
            isNull(postsMedia.postId),
          ),
        )
        .returning({ id: postsMedia.id });
      if (res.length > 0) processed++;
    }

    const durationMs = Date.now() - startedAt.getTime();
    await db
      .update(postsCronRuns)
      .set({
        finishedAt: new Date(),
        durationMs,
        itemsProcessed: processed,
        ok: true,
      })
      .where(sql`${postsCronRuns.id} = ${runRow.id}`);

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
    return { ok: false, itemsProcessed: 0, durationMs, error: message };
  }
}
