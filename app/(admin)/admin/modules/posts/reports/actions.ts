"use server";
// app/(admin)/admin/modules/posts/reports/actions.ts
//
// Server Actions admin-side per la moderation queue del modulo Posts.
// Gate RBAC `modules:posts.moderate` (extra permission, NON auto-granted).

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { posts, postsReports } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { invalidateFeedCache } from "@/lib/modules/posts/services/feed-cache";
import { invalidatePostCache } from "@/lib/modules/posts/services/post-cache";
import { z } from "zod";

const ReviewSchema = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(["dismissed", "actioned"]),
  note: z.string().max(2000).optional().nullable(),
});

export type ReviewReportResult =
  | { ok: true; softDeletedPostId?: string }
  | { ok: false; error: string };

/** Risoluzione di una segnalazione:
 *  - decision="dismissed" → status='dismissed' + reviewed_by/at
 *  - decision="actioned"  → status='actioned' + reviewed_by/at +
 *                           soft-delete del post target (deleted_at=NOW())
 *  Note opzionale viene appeso in `details` per audit trail interno.
 */
export async function reviewReportAction(
  input: z.input<typeof ReviewSchema>,
): Promise<ReviewReportResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { reportId, decision, note } = parsed.data;

  // 1. Carica il report + post target (verifica esistenza)
  const [report] = await db
    .select({
      id: postsReports.id,
      postId: postsReports.postId,
      status: postsReports.status,
      details: postsReports.details,
    })
    .from(postsReports)
    .where(eq(postsReports.id, reportId))
    .limit(1);
  if (!report) return { ok: false, error: "report_not_found" };

  // Già processato → idempotenza, ritorna ok senza ri-eseguire effetti.
  if (report.status === "dismissed" || report.status === "actioned") {
    return { ok: true };
  }

  // 2. Appendi nota di review ai details esistenti (audit trail)
  const noteSuffix =
    note && note.trim().length > 0
      ? `\n\n— mod note (${new Date().toISOString()} by ${user.id}): ${note.trim()}`
      : "";
  const newDetails = (report.details ?? "") + noteSuffix;

  // 3. Aggiorna il report
  await db
    .update(postsReports)
    .set({
      status: decision,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      details: newDetails.length > 0 ? newDetails : null,
    })
    .where(eq(postsReports.id, reportId));

  let softDeletedPostId: string | undefined;

  // 4. Se "actioned" → soft-delete del post (se non già cancellato)
  if (decision === "actioned") {
    const [target] = await db
      .select({ id: posts.id, deletedAt: posts.deletedAt })
      .from(posts)
      .where(eq(posts.id, report.postId))
      .limit(1);

    if (target && !target.deletedAt) {
      await db
        .update(posts)
        .set({ deletedAt: new Date() })
        .where(and(eq(posts.id, report.postId), isNull(posts.deletedAt)));

      await invalidatePostCache(report.postId);
      await invalidateFeedCache("discover");
      softDeletedPostId = report.postId;
    }
  }

  revalidatePath("/admin/modules/posts/reports");
  return { ok: true, softDeletedPostId };
}
