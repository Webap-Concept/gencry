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
import {
  notifications,
  posts,
  postsComments,
  postsReports,
  users,
  userProfiles,
  type StrikeSourceType,
} from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { issueStrike } from "@/lib/auth/strikes";
import { invalidateFeedCache } from "@/lib/modules/posts/services/feed-cache";
import { invalidatePostCache } from "@/lib/modules/posts/services/post-cache";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendModerationStrikeReceivedEmail } from "@/lib/email/templates/moderation-strike-received";
import { sendModerationBannedEmail } from "@/lib/email/templates/moderation-banned";
import {
  getCommentReportsQueue,
  getReportsForComment,
  getReportsForPost,
  getReportsQueue,
  type CommentReportQueueGroupRow,
  type ReportQueueGroupRow,
  type ReportQueueStatus,
} from "@/lib/modules/posts/queries";
import { z } from "zod";

export type ReportDetailRow = {
  id: string;
  reason: string;
  status: string;
  details: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reporter: {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
};

const ReviewSchema = z.object({
  postId: z.string().uuid(),
  decision: z.enum(["dismissed", "actioned"]),
  note: z.string().max(2000).optional().nullable(),
  /** Se true E decision='actioned', emette uno strike all'autore del
   *  post via lib/auth/strikes. 3° strike → ban automatico (trigger DB). */
  issueStrike: z.boolean().optional(),
  /** Reason key da catalog admin-editable (riusa report-reasons). Solo
   *  rilevante quando issueStrike=true; gli altri casi lo ignorano. */
  strikeReason: z.string().max(40).optional(),
});

export type ReviewReportResult =
  | {
      ok: true;
      updatedReports: number;
      softDeletedPostId?: string;
      strike?: {
        issued: boolean;
        activeCount: number;
        bannedNow: boolean;
      };
    }
  | { ok: false; error: string };

/**
 * Helper interno: emette uno strike all'autore + invia notifica utente
 * (`moderation.strike_received` o `moderation.banned`). Best-effort sulla
 * notifica — se fallisce loggiamo ma NON ribaltiamo lo strike (è
 * già committato, audit trail vale più della notifica).
 */
async function applyStrikeAndNotify(args: {
  authorId: string;
  issuedBy: string;
  sourceType: StrikeSourceType;
  sourceId: string;
  sourcePreview: string | null;
  reason: string;
  note: string | null;
}): Promise<{ activeCount: number; bannedNow: boolean }> {
  const result = await issueStrike({
    userId: args.authorId,
    issuedBy: args.issuedBy,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourcePreview: args.sourcePreview,
    reason: args.reason,
    note: args.note,
  });

  try {
    await db.insert(notifications).values({
      userId: args.authorId,
      type: result.bannedNow
        ? "moderation.banned"
        : "moderation.strike_received",
      actorId: args.issuedBy,
      // I report sui contenuti mod sono di proprietà del modulo posts:
      // settiamo post_id solo se sourceType='post' per coerenza schema.
      postId: args.sourceType === "post" ? args.sourceId : null,
      commentId: args.sourceType === "comment" ? args.sourceId : null,
      payload: {
        strike_number: result.activeStrikesCount,
        reason: args.reason,
        source_type: args.sourceType,
        source_preview: args.sourcePreview,
      },
    });
  } catch (err) {
    console.warn("[reports] strike notification insert failed:", err);
  }

  // Email transazionale (best-effort: fail non rolla la moderation
  // action). Risolvi email + firstName + locale del destinatario.
  try {
    const [target] = await db
      .select({
        email: users.email,
        userLocale: users.locale,
        firstName: userProfiles.firstName,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, args.authorId))
      .limit(1);

    if (target?.email) {
      const locale = await resolveRecipientLocale(target.userLocale ?? null);
      const userName = target.firstName ?? undefined;
      if (result.bannedNow) {
        await sendModerationBannedEmail({
          to: target.email,
          userName,
          reason: args.reason,
          sourceType: args.sourceType,
          sourcePreview: args.sourcePreview,
          locale,
        });
      } else {
        await sendModerationStrikeReceivedEmail({
          to: target.email,
          userName,
          strikeNumber: result.activeStrikesCount,
          reason: args.reason,
          sourceType: args.sourceType,
          sourcePreview: args.sourcePreview,
          locale,
        });
      }
    }
  } catch (err) {
    console.warn("[reports] strike email send failed:", err);
  }

  return {
    activeCount: result.activeStrikesCount,
    bannedNow: result.bannedNow,
  };
}

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
  const { postId, decision, note, issueStrike: shouldStrike, strikeReason } =
    parsed.data;

  // 1. Verifica che il post esiste + autore + preview body per strike payload
  const [target] = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      body: posts.body,
      deletedAt: posts.deletedAt,
    })
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

  // 4. Strike opzionale (solo se decision='actioned'). Emesso DOPO il
  //    soft-delete del contenuto: lo strike senza azione sul contenuto
  //    è semanticamente incoerente (Twitter pattern). L'autore viene
  //    notificato della strike (o del ban automatico al 3°).
  let strikeOutcome:
    | { issued: boolean; activeCount: number; bannedNow: boolean }
    | undefined;
  if (decision === "actioned" && shouldStrike) {
    const preview = (target.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || null;
    const reason = (strikeReason ?? "").trim() || "moderation";
    const outcome = await applyStrikeAndNotify({
      authorId: target.authorId,
      issuedBy: user.id,
      sourceType: "post",
      sourceId: postId,
      sourcePreview: preview,
      reason,
      note: note?.trim() || null,
    });
    strikeOutcome = { issued: true, ...outcome };
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
    strike: strikeOutcome,
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

// ─────────────────────────────────────────────────────────────────────────
// COMMENT variants — specchio delle 2 actions sopra ma operanti sui
// comment reports (polymorphic schema posts_reports, vedi M_posts_010).
// "actioned" qui implica soft-delete del COMMENTO, non del post.
// ─────────────────────────────────────────────────────────────────────────

const ReviewCommentSchema = z.object({
  commentId: z.string().uuid(),
  decision: z.enum(["dismissed", "actioned"]),
  note: z.string().max(2000).optional().nullable(),
  issueStrike: z.boolean().optional(),
  strikeReason: z.string().max(40).optional(),
});

export type ReviewCommentReportResult =
  | {
      ok: true;
      updatedReports: number;
      softDeletedCommentId?: string;
      strike?: { issued: boolean; activeCount: number; bannedNow: boolean };
    }
  | { ok: false; error: string };

export async function reviewCommentReportAction(
  input: z.input<typeof ReviewCommentSchema>,
): Promise<ReviewCommentReportResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = ReviewCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const {
    commentId,
    decision,
    note,
    issueStrike: shouldStrike,
    strikeReason,
  } = parsed.data;

  const [target] = await db
    .select({
      id: postsComments.id,
      postId: postsComments.postId,
      authorId: postsComments.authorId,
      body: postsComments.body,
      deletedAt: postsComments.deletedAt,
    })
    .from(postsComments)
    .where(eq(postsComments.id, commentId))
    .limit(1);
  if (!target) return { ok: false, error: "comment_not_found" };

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
      and(
        eq(postsReports.commentId, commentId),
        eq(postsReports.status, "open"),
      ),
    )
    .returning({ id: postsReports.id });

  let softDeletedCommentId: string | undefined;

  // "actioned" → soft-delete del commento. NON tocca il post che lo
  // contiene: la moderation è scoped al commento.
  if (decision === "actioned" && !target.deletedAt) {
    await db
      .update(postsComments)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(postsComments.id, commentId), isNull(postsComments.deletedAt)),
      );

    // Il counter posts.comments_count è tenuto in sync da trigger DB
    // (vedi M_posts_001). Invalida la post-cache per refresh del card.
    await invalidatePostCache(target.postId);
    softDeletedCommentId = commentId;
  }

  let strikeOutcome:
    | { issued: boolean; activeCount: number; bannedNow: boolean }
    | undefined;
  if (decision === "actioned" && shouldStrike) {
    const preview = (target.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || null;
    const reason = (strikeReason ?? "").trim() || "moderation";
    const outcome = await applyStrikeAndNotify({
      authorId: target.authorId,
      issuedBy: user.id,
      sourceType: "comment",
      sourceId: commentId,
      sourcePreview: preview,
      reason,
      note: note?.trim() || null,
    });
    strikeOutcome = { issued: true, ...outcome };
  }

  revalidatePath("/admin/modules/posts/reports");
  return {
    ok: true,
    updatedReports: updated.length,
    softDeletedCommentId,
    strike: strikeOutcome,
  };
}

export type LoadMoreCommentReportsResult =
  | { ok: true; rows: CommentReportQueueGroupRow[]; nextCursor: string | null }
  | { ok: false; error: string };

export async function loadMoreCommentReportsAction(
  input: z.input<typeof LoadMoreSchema>,
): Promise<LoadMoreCommentReportsResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const parsed = LoadMoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const page = await getCommentReportsQueue({
    status: parsed.data.status as ReportQueueStatus,
    cursor: parsed.data.cursor,
    limit: 25,
  });
  return { ok: true, rows: page.rows, nextCursor: page.nextCursor };
}

// ─────────────────────────────────────────────────────────────────────────
// Storico dettagliato segnalazioni per UN target (post o commento).
// Usato dal Review dialog: lazy fetch al mount per mostrare ogni
// segnalazione con la sua details (incluse le note del moderatore appese
// nel campo details via COALESCE || ${noteSuffix}).
// ─────────────────────────────────────────────────────────────────────────

const ReportDetailsInputSchema = z.object({
  kind: z.enum(["post", "comment"]),
  targetId: z.string().uuid(),
});

export type ReportDetailsResult =
  | { ok: true; rows: ReportDetailRow[] }
  | { ok: false; error: string };

export async function getReportDetailsAction(
  input: z.input<typeof ReportDetailsInputSchema>,
): Promise<ReportDetailsResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const parsed = ReportDetailsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const raw =
    parsed.data.kind === "post"
      ? await getReportsForPost(parsed.data.targetId)
      : await getReportsForComment(parsed.data.targetId);
  return {
    ok: true,
    rows: raw.map((r) => ({
      id: r.report.id,
      reason: r.report.reason,
      status: r.report.status,
      details: r.report.details,
      createdAt: r.report.createdAt,
      reviewedAt: r.report.reviewedAt,
      reporter: {
        id: r.reporter.id,
        username: r.reporter.username,
        avatarUrl: r.reporter.avatarUrl,
      },
    })),
  };
}
