"use server";
// app/(admin)/admin/modules/posts/reports/actions.ts
//
// Server Actions admin-side per la moderation queue del modulo Posts.
// Gate RBAC `modules:posts.moderate` (extra permission, NON auto-granted).
//
// Pattern cambiato il 2026-05-15: la queue è raggruppata per post, quindi
// la decisione si applica in BATCH a TUTTE le segnalazioni `open` dello
// stesso post (prima 1 click = 1 report risolto, ora 1 click = caso
// completo chiuso, come Twitter/Facebook).

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { posts, postsReports } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { invalidateFeedCache } from "@/lib/modules/posts/services/feed-cache";
import { invalidatePostCache } from "@/lib/modules/posts/services/post-cache";
import {
  getReportsQueue,
  type ReportQueueGroupRow,
  type ReportQueueStatus,
} from "@/lib/modules/posts/queries";
import { z } from "zod";

const ReviewSchema = z.object({
  postId: z.string().uuid(),
  decision: z.enum(["dismissed", "actioned"]),
  note: z.string().max(2000).optional().nullable(),
});

export type ReviewReportResult =
  | { ok: true; updatedReports: number; softDeletedPostId?: string }
  | { ok: false; error: string };

/**
 * Risoluzione batch di tutte le segnalazioni `open` di un post:
 *  - decision="dismissed" → tutte le open → status='dismissed' +
 *                           reviewed_by/at popolati
 *  - decision="actioned"  → idem + soft-delete del post (deleted_at=NOW())
 *
 * La `note` opzionale è appesa ai details di OGNI segnalazione open per
 * audit trail.
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
  const { postId, decision, note } = parsed.data;

  // 1. Verifica che il post esiste
  const [target] = await db
    .select({ id: posts.id, deletedAt: posts.deletedAt })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!target) return { ok: false, error: "post_not_found" };

  // 2. Aggiorna in batch TUTTE le segnalazioni open del post.
  //    Note appesa a details esistenti via COALESCE (audit trail).
  const trimmedNote = note?.trim() ?? "";
  const noteSuffix =
    trimmedNote.length > 0
      ? `\n\n— mod note (${new Date().toISOString()} by ${user.id}): ${trimmedNote}`
      : "";

  const updated = await db
    .update(postsReports)
    .set({
      status: decision,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      details: noteSuffix
        ? sql`COALESCE(${postsReports.details}, '') || ${noteSuffix}`
        : postsReports.details,
    })
    .where(
      and(eq(postsReports.postId, postId), eq(postsReports.status, "open")),
    )
    .returning({ id: postsReports.id });

  let softDeletedPostId: string | undefined;

  // 3. Se "actioned" → soft-delete del post (se non già cancellato).
  //    deleted_by = uuid del moderatore: la deleted page risolverà
  //    l'uuid in @username via JOIN per l'audit visivo.
  if (decision === "actioned" && !target.deletedAt) {
    await db
      .update(posts)
      .set({ deletedAt: new Date(), deletedBy: user.id })
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)));

    await invalidatePostCache(postId);
    await invalidateFeedCache("discover");
    softDeletedPostId = postId;
  }

  revalidatePath("/admin/modules/posts/reports");
  // Anche /admin/modules/posts/deleted se è actioned, così la lista
  // dei post in grace si aggiorna in tempo reale.
  if (softDeletedPostId) {
    revalidatePath("/admin/modules/posts/deleted");
  }

  return {
    ok: true,
    updatedReports: updated.length,
    softDeletedPostId,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Pagination — client-side append "Carica altre"
// ─────────────────────────────────────────────────────────────────────────

const LoadMoreSchema = z.object({
  status: z.enum(["open", "reviewed", "dismissed", "actioned", "all"]),
  cursor: z.string().min(1),
});

export type LoadMoreReportsResult =
  | { ok: true; rows: ReportQueueGroupRow[]; nextCursor: string | null }
  | { ok: false; error: string };

/**
 * Fetcha la prossima pagina (25 row) della queue raggruppata.
 * Cursor + status arrivano dal client. Reuse della stessa query
 * server-side per garantire ordering + filtri identici al first paint.
 */
export async function loadMoreReportsAction(
  input: z.input<typeof LoadMoreSchema>,
): Promise<LoadMoreReportsResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const parsed = LoadMoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const page = await getReportsQueue({
    status: parsed.data.status as ReportQueueStatus,
    cursor: parsed.data.cursor,
    limit: 25,
  });
  return { ok: true, rows: page.rows, nextCursor: page.nextCursor };
}
