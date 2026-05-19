// Generator: rolling-summary degli open reports nella queue di moderation
// dei posts. 1 candidate singleton ("posts_reports_pending") col count
// totale + breakdown (post vs comment) in metadata. Severity scala col
// volume:
//   info     < 10
//   warning  10–49
//   critical >= 50
//
// Auto-resolve naturale: quando l'admin chiude l'ultima segnalazione
// (`status != 'open'`), il generator emette 0 candidate e il dispatcher
// auto-risolve la riga al prossimo tick. Per il path "nuovo report"
// esponiamo `refreshPostsReportsAdminNotification()` che il modulo
// posts chiama inline per aggiornamento zero-latency.

import { db } from "@/lib/db/drizzle";
import { buildAdminPath } from "@/lib/admin-paths";
import { isUndefinedTableError } from "@/lib/db/errors";
import { postsReports } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { upsertCandidate } from "../upsert";
import type {
  NotificationCandidate,
  NotificationGenerator,
  NotificationSeverity,
} from "../types";

export const POSTS_REPORTS_PENDING_TYPE = "posts_reports_pending";
const REQUIRED_PERMISSION = "modules:posts.moderate";
const DEDUP_KEY = "posts_reports_pending";

function severityForCount(count: number): NotificationSeverity {
  if (count >= 50) return "critical";
  if (count >= 10) return "warning";
  return "info";
}

type PendingCounts = { total: number; posts: number; comments: number };

async function loadPendingCounts(): Promise<PendingCounts> {
  // 2 conditional counts in 1 round-trip. Indice partial già esistente su
  // posts_reports(status) — il piano usa index scan, costo trascurabile.
  try {
    const rows = await db
      .select({
        posts: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.postId} IS NOT NULL)::int`,
        comments: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.commentId} IS NOT NULL)::int`,
      })
      .from(postsReports)
      .where(eq(postsReports.status, "open"));

    const r = rows[0];
    const postsN = Number(r?.posts ?? 0);
    const commentsN = Number(r?.comments ?? 0);
    return { total: postsN + commentsN, posts: postsN, comments: commentsN };
  } catch (err) {
    // Migration non ancora applicata → comportati come "0 pending" così
    // il dispatcher non rompe (stessa policy di suspicious-sessions).
    if (isUndefinedTableError(err, "posts_reports")) {
      console.warn(
        "[posts-reports] posts_reports table missing — run the SQL migration",
      );
      return { total: 0, posts: 0, comments: 0 };
    }
    throw err;
  }
}

async function buildCandidate(): Promise<NotificationCandidate | null> {
  const { total, posts, comments } = await loadPendingCounts();
  if (total === 0) return null;

  const reportsBase = await buildAdminPath("/modules/posts/reports");
  const noun = total === 1 ? "report" : "reports";
  const breakdown =
    posts > 0 && comments > 0
      ? `${posts} on post${posts === 1 ? "" : "s"}, ${comments} on comment${comments === 1 ? "" : "s"}`
      : posts > 0
        ? `${posts} on post${posts === 1 ? "" : "s"}`
        : `${comments} on comment${comments === 1 ? "" : "s"}`;

  return {
    type: POSTS_REPORTS_PENDING_TYPE,
    severity: severityForCount(total),
    title: `${total} pending content ${noun} to review`,
    body: `${breakdown}. Open the moderation queue to triage.`,
    link: reportsBase,
    dedupKey: DEDUP_KEY,
    metadata: { total, posts, comments },
  };
}

export const postsReportsPendingGenerator: NotificationGenerator = {
  type: POSTS_REPORTS_PENDING_TYPE,
  requiredPermission: REQUIRED_PERMISSION,
  run: async () => {
    const c = await buildCandidate();
    return c ? [c] : [];
  },
};

/**
 * Refresh inline chiamato dal modulo posts subito dopo aver creato un
 * nuovo report. Aggiorna il counter senza aspettare il prossimo tick
 * del dispatcher throttled (1h).
 *
 * Idempotente. Il caller DEVE wrappare in try/catch (o `.catch()`) per
 * evitare che un fallimento qui blocchi il flusso utente — il report
 * è già stato salvato a questo punto.
 */
export async function refreshPostsReportsAdminNotification(): Promise<void> {
  const c = await buildCandidate();
  // count=0 → niente upsert. Lasciamo all'auto-resolve del prossimo tick
  // dispatcher la chiusura della riga esistente.
  if (!c) return;
  await upsertCandidate(c, REQUIRED_PERMISSION);
}
