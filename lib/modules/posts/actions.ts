"use server";
// lib/modules/posts/actions.ts
//
// Server Actions del modulo Posts — write path. Coprono tutte le mutation
// testuali del feed sociale. Le media actions (createPostMediaTicket /
// confirmPostMediaUpload) sono volutamente fuori scope: arriveranno in
// PR-6 insieme alla pipeline R2 + image processing reale, così non
// dobbiamo introdurre primitive S3 mentre il `media-processor` è ancora
// stub.
//
// Contract:
//   - Ogni action chiama `getUser()` per gate AUTH. Se null → ritorna
//     { ok: false, error: 'posts.errors.unauthenticated' }.
//   - Validation Zod inline. I `message` Zod sono i18n keys nel namespace
//     `validation.posts.*` (vedi PR-5 quando aggiungeremo le traduzioni;
//     finché non esistono fallback testo italiano leggibile).
//   - Rate-limit: chiamata sempre (vedi feedback_hookable_services).
//     In V1 lo stub ritorna sempre ok; quando attiveremo Upstash sliding
//     window blocca senza modifiche qui.
//   - Cache invalidation chiamata sempre dopo write (feed + post cache).
//     V1 no-op, V2 cancella KV.
//   - Transazioni Drizzle per le mutation che toccano >1 tabella
//     (createPost = posts + posts_tickers + posts_mentions; editPost
//     idem con DELETE + re-INSERT dei lookup table).
//
// Non incluse in PR-3 (per design):
//   - createPostMediaTicket / confirmPostMediaUpload — PR-6
//   - restorePost (admin) — PR-8 (modulo moderation)
//   - admin soft-delete by id — PR-8

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  posts,
  postsMedia,
  postsTickers,
  postsMentions,
  postsReports,
  userProfiles,
  POST_REACTION_KINDS,
  POST_VISIBILITIES,
  type PostReactionKind,
  type PostVisibility,
} from "@/lib/db/schema";
import {
  addReaction as reactionsAddService,
  removeReaction as reactionsRemoveService,
} from "./services/reactions";
import {
  createComment as commentsCreateService,
  editComment as commentsEditService,
  softDeleteComment as commentsSoftDeleteService,
} from "./services/comments";
import { toggleBookmark as bookmarksToggleService } from "./services/bookmarks";
import { toggleUserBlock as blocksToggleService } from "./services/blocks";
import { invalidateFeedCache as feedInvalidate } from "./services/feed-cache";
import { invalidatePostCache as postInvalidate } from "./services/post-cache";
import { checkPostRateLimit as rateLimitCheck } from "./services/rate-limit";
import { extractMentions, extractTickers } from "./lib/parsing";
import {
  findActiveReportReason,
  getActiveReportReasons,
  type ReportReason,
} from "./services/report-reasons";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; retryAfter?: number; field?: string };

const I18N = {
  unauthenticated: "posts.errors.unauthenticated",
  banned: "posts.errors.banned",
  rateLimited: "posts.errors.rate_limited",
  notFound: "posts.errors.not_found",
  forbidden: "posts.errors.forbidden",
  editWindowExpired: "posts.errors.edit_window_expired",
  visibilityNotRestrictive: "posts.errors.visibility_not_more_restrictive",
  emptyBody: "posts.errors.empty_body",
  bodyTooLong: "posts.errors.body_too_long",
  selfRepost: "posts.errors.self_repost",
  targetUnavailable: "posts.errors.target_unavailable",
} as const;

const VISIBILITY_RANK: Record<PostVisibility, number> = {
  public: 0,
  members: 1,
  followers: 2,
  private: 3,
};

// Return type esplicito del literal: TS lo restringe al ramo false del
// discriminated union ActionResult<T>, qualunque T scelga il chiamante,
// senza dover dichiarare `fail` generic.
function fail(
  error: string,
  extra: { retryAfter?: number; field?: string } = {},
) {
  return { ok: false as const, error, ...extra };
}

// ─────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────

const VisibilitySchema = z.enum(POST_VISIBILITIES);
const ReactionKindSchema = z.enum(POST_REACTION_KINDS);
const UuidSchema = z.string().uuid();

const CreatePostInputSchema = z.object({
  body: z.string(),
  visibility: VisibilitySchema.default("public"),
  /**
   * IDs dei posts_media già caricati & confirmed via la pipeline
   * createPostMediaTicket → confirmPostMediaUpload. Vengono claimati
   * (UPDATE post_id) dentro la transaction del createPost.
   */
  mediaIds: z.array(UuidSchema).max(10).optional(),
});

const EditPostInputSchema = z.object({
  postId: UuidSchema,
  body: z.string(),
  visibility: VisibilitySchema.optional(),
});

const ToggleReactionInputSchema = z.object({
  postId: UuidSchema,
  reaction: ReactionKindSchema,
});

const CreateCommentInputSchema = z.object({
  postId: UuidSchema,
  body: z.string(),
  parentCommentId: UuidSchema.optional().nullable(),
});

const EditCommentInputSchema = z.object({
  commentId: UuidSchema,
  body: z.string(),
});

const SoftDeleteCommentInputSchema = z.object({
  commentId: UuidSchema,
});

const ToggleBookmarkInputSchema = z.object({
  postId: UuidSchema,
});

const ToggleUserBlockInputSchema = z.object({
  blockedUserId: UuidSchema,
});

const CreateQuoteRepostInputSchema = z.object({
  repostOfId: UuidSchema,
  body: z.string().min(1, "validation.posts.repost_needs_body"),
});

const ReportPostInputSchema = z.object({
  postId: UuidSchema,
  // Lista dei reason key è admin-editable (vedi services/report-reasons.ts).
  // Qui validiamo solo shape; il match con la lista attiva avviene a runtime
  // dentro reportPost().
  reason: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  details: z.string().max(2000).optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers — body + visibility validation, mention resolution
// ─────────────────────────────────────────────────────────────────────────

async function loadLimits() {
  const settings = await getAppSettings();
  return {
    maxBodyLength: parseInt(settings["modules.posts.max_body_length"], 10) || 2000,
    editWindowMinutes: parseInt(settings["modules.posts.edit_window_minutes"], 10) || 10,
  };
}

function validateBody(body: string, maxLen: number): { ok: true; body: string } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: I18N.emptyBody };
  if (trimmed.length > maxLen) return { ok: false, error: I18N.bodyTooLong };
  return { ok: true, body: trimmed };
}

/**
 * Risolve gli username menzionati in user_id. Username inesistenti sono
 * silently ignorati. La query è singola (`IN (...)`) per N username.
 */
async function resolveMentionUserIds(usernames: Set<string>): Promise<string[]> {
  if (usernames.size === 0) return [];
  const list = Array.from(usernames);
  // Drizzle `inArray` con lowercased usernames; la colonna NON ha lower
  // index, ma per <30 mentions per post va bene una seq-scan filtrata
  // dall'index UNIQUE.
  const rows = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(sql`LOWER(${userProfiles.username}) IN (${sql.join(list.map((u) => sql`${u}`), sql`, `)})`);
  return rows.map((r) => r.userId);
}

/**
 * Re-popola posts_tickers e posts_mentions per `postId`. Usata sia in
 * createPost (no DELETE precedente, tabella vuota per quel post) sia in
 * editPost (DELETE prima per gestire ticker/mention rimossi dal body).
 *
 * Da chiamare DENTRO `db.transaction()` quando si vuole atomicità rispetto
 * all'INSERT/UPDATE del post.
 */
// Estrae il tipo del `tx` callback di db.transaction(). PgTransaction è
// più stretto di `typeof db` (manca `$client`) → tipizzare con `typeof db`
// rifiuta `tx` al type-check.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function syncTickersAndMentions(
  tx: DbTx,
  postId: string,
  body: string,
  postCreatedAt: Date,
): Promise<void> {
  const tickers = extractTickers(body);
  const mentions = extractMentions(body);

  if (tickers.size > 0) {
    await tx
      .insert(postsTickers)
      .values(
        Array.from(tickers).map((ticker) => ({
          postId,
          ticker,
          createdAt: postCreatedAt,
        })),
      )
      .onConflictDoNothing({ target: [postsTickers.postId, postsTickers.ticker] });
  }

  const mentionUserIds = await resolveMentionUserIds(mentions);
  if (mentionUserIds.length > 0) {
    await tx
      .insert(postsMentions)
      .values(
        mentionUserIds.map((mentionedUserId) => ({
          postId,
          mentionedUserId,
          createdAt: postCreatedAt,
        })),
      )
      .onConflictDoNothing({
        target: [postsMentions.postId, postsMentions.mentionedUserId],
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Posts CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function createPost(
  input: z.input<typeof CreatePostInputSchema>,
): Promise<ActionResult<{ postId: string }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = CreatePostInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const rl = await rateLimitCheck(user.id, "post");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  const { maxBodyLength } = await loadLimits();
  const bodyCheck = validateBody(parsed.data.body, maxBodyLength);
  if (!bodyCheck.ok) return fail(bodyCheck.error, { field: "body" });

  const postId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(posts)
      .values({
        authorId: user.id,
        body: bodyCheck.body,
        visibility: parsed.data.visibility,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });
    await syncTickersAndMentions(tx, inserted.id, bodyCheck.body, inserted.createdAt);

    // Claim dei media draft (atomic: o vanno tutti o nessuno via
    // rollback della transaction). Filtro WHERE garantisce ownership.
    const mediaIds = parsed.data.mediaIds ?? [];
    if (mediaIds.length > 0) {
      await tx
        .update(postsMedia)
        .set({ postId: inserted.id })
        .where(
          sql`${postsMedia.id} IN (${sql.join(mediaIds.map((id) => sql`${id}`), sql`, `)})
              AND ${postsMedia.authorId} = ${user.id}
              AND ${postsMedia.postId} IS NULL`,
        );
    }
    return inserted.id;
  });

  await feedInvalidate("discover");
  await feedInvalidate({ followersOf: user.id });
  await feedInvalidate({ profile: user.id });

  return { ok: true, data: { postId } };
}

export async function editPost(
  input: z.input<typeof EditPostInputSchema>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = EditPostInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { maxBodyLength, editWindowMinutes } = await loadLimits();
  const bodyCheck = validateBody(parsed.data.body, maxBodyLength);
  if (!bodyCheck.ok) return fail(bodyCheck.error, { field: "body" });

  // Carica il post per check authorship + visibility restrict-only + window
  const existing = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      visibility: posts.visibility,
      createdAt: posts.createdAt,
      deletedAt: posts.deletedAt,
    })
    .from(posts)
    .where(eq(posts.id, parsed.data.postId))
    .limit(1);

  const post = existing[0];
  if (!post || post.deletedAt) return fail(I18N.notFound);
  if (post.authorId !== user.id) return fail(I18N.forbidden);

  // Edit window
  const ageMs = Date.now() - post.createdAt.getTime();
  if (ageMs > editWindowMinutes * 60_000) return fail(I18N.editWindowExpired);

  // Visibility: solo verso più restrittivo
  const nextVisibility = parsed.data.visibility ?? (post.visibility as PostVisibility);
  if (
    VISIBILITY_RANK[nextVisibility] <
    VISIBILITY_RANK[post.visibility as PostVisibility]
  ) {
    return fail(I18N.visibilityNotRestrictive, { field: "visibility" });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        body: bodyCheck.body,
        visibility: nextVisibility,
        editedAt: sql`NOW()`,
      })
      .where(eq(posts.id, parsed.data.postId));

    // Re-sync ticker/mention: clear + re-insert (le righe sono <30,
    // delete-then-insert è più semplice di diff incrementale)
    await tx.delete(postsTickers).where(eq(postsTickers.postId, parsed.data.postId));
    await tx
      .delete(postsMentions)
      .where(eq(postsMentions.postId, parsed.data.postId));
    await syncTickersAndMentions(tx, parsed.data.postId, bodyCheck.body, post.createdAt);
  });

  await postInvalidate(parsed.data.postId);
  // Visibility cambiata = il post può uscire da Discover o profilo pubblico
  await feedInvalidate("discover");
  await feedInvalidate({ profile: user.id });

  return { ok: true };
}

export async function softDeletePost(
  input: { postId: string },
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = UuidSchema.safeParse(input.postId);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const result = await db
    .update(posts)
    .set({ deletedAt: sql`NOW()`, deletedBy: "author" })
    .where(
      and(
        eq(posts.id, parsed.data),
        eq(posts.authorId, user.id),
        isNull(posts.deletedAt),
      ),
    )
    .returning({ id: posts.id });

  if (result.length === 0) return fail(I18N.notFound);

  await postInvalidate(parsed.data);
  await feedInvalidate("discover");
  await feedInvalidate({ profile: user.id });
  await feedInvalidate({ followersOf: user.id });

  // Invalida la Router Cache (RSC payload) di tutto il (protected)
  // layout: dopo il soft-delete il post deve sparire da feed/profilo/
  // single-page al next visit anche se l'utente fa back.
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Reactions
// ─────────────────────────────────────────────────────────────────────────

export async function toggleReaction(
  input: z.input<typeof ToggleReactionInputSchema>,
): Promise<ActionResult<{ active: boolean }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = ToggleReactionInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const rl = await rateLimitCheck(user.id, "reaction");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  // Toggle pattern via service (gestisce conflict + delete)
  const removed = await reactionsRemoveService(parsed.data.postId, user.id, parsed.data.reaction);
  if (removed.removed) {
    await postInvalidate(parsed.data.postId);
    return { ok: true, data: { active: false } };
  }
  const inserted = await reactionsAddService(parsed.data.postId, user.id, parsed.data.reaction);
  await postInvalidate(parsed.data.postId);
  return { ok: true, data: { active: inserted.inserted } };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Comments
// ─────────────────────────────────────────────────────────────────────────

export async function createComment(
  input: z.input<typeof CreateCommentInputSchema>,
): Promise<ActionResult<{ commentId: string }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = CreateCommentInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const rl = await rateLimitCheck(user.id, "comment");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  // Il service valida body length internamente e lancia su errore
  try {
    const comment = await commentsCreateService({
      postId: parsed.data.postId,
      authorId: user.id,
      body: parsed.data.body,
      parentCommentId: parsed.data.parentCommentId ?? null,
    });
    await postInvalidate(parsed.data.postId);
    return { ok: true, data: { commentId: comment.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : I18N.emptyBody;
    return fail(msg);
  }
}

export async function editComment(
  input: z.input<typeof EditCommentInputSchema>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = EditCommentInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { editWindowMinutes } = await loadLimits();

  try {
    const updated = await commentsEditService({
      commentId: parsed.data.commentId,
      authorId: user.id,
      body: parsed.data.body,
      editWindowMinutes,
    });
    if (!updated) return fail(I18N.editWindowExpired);
    await postInvalidate(updated.postId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : I18N.emptyBody;
    return fail(msg);
  }
}

export async function softDeleteComment(
  input: z.input<typeof SoftDeleteCommentInputSchema>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = SoftDeleteCommentInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { deleted } = await commentsSoftDeleteService({
    commentId: parsed.data.commentId,
    requesterId: user.id,
  });
  if (!deleted) return fail(I18N.notFound);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Bookmarks
// ─────────────────────────────────────────────────────────────────────────

export async function toggleBookmark(
  input: z.input<typeof ToggleBookmarkInputSchema>,
): Promise<ActionResult<{ bookmarked: boolean }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = ToggleBookmarkInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const result = await bookmarksToggleService(user.id, parsed.data.postId);
  await postInvalidate(parsed.data.postId);
  await feedInvalidate({ bookmarksOf: user.id });
  return { ok: true, data: result };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Quote Repost
// ─────────────────────────────────────────────────────────────────────────

export async function createQuoteRepost(
  input: z.input<typeof CreateQuoteRepostInputSchema>,
): Promise<ActionResult<{ postId: string }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = CreateQuoteRepostInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const rl = await rateLimitCheck(user.id, "repost");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  const { maxBodyLength } = await loadLimits();
  const bodyCheck = validateBody(parsed.data.body, maxBodyLength);
  if (!bodyCheck.ok) return fail(bodyCheck.error, { field: "body" });

  // Verifica che il target esiste e non è soft-deleted. Le policy di
  // visibility (es. quote-reposto di un private/followers a cui non
  // hai accesso) verranno enforcate quando arriverà il modulo `follows`.
  const target = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      deletedAt: posts.deletedAt,
    })
    .from(posts)
    .where(eq(posts.id, parsed.data.repostOfId))
    .limit(1);

  if (!target[0] || target[0].deletedAt) return fail(I18N.targetUnavailable);
  if (target[0].id === parsed.data.repostOfId && target[0].authorId === user.id) {
    // Reposting il proprio post non ha valore — UX scelta di prodotto
    return fail(I18N.selfRepost);
  }

  const postId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(posts)
      .values({
        authorId: user.id,
        body: bodyCheck.body,
        visibility: "public",
        repostOfId: parsed.data.repostOfId,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });
    await syncTickersAndMentions(tx, inserted.id, bodyCheck.body, inserted.createdAt);
    return inserted.id;
  });

  await feedInvalidate("discover");
  await feedInvalidate({ followersOf: user.id });
  await feedInvalidate({ profile: user.id });
  await postInvalidate(parsed.data.repostOfId); // counter reposts_count del target

  return { ok: true, data: { postId } };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — User Block (mutual)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Toggle block mutuale. Se il viewer aveva bloccato l'utente, sblocca;
 * altrimenti blocca. Idempotente.
 *
 * Mutual: una sola riga in posts_user_blocks crea il muro per entrambe
 * le direzioni nelle query feed/post.
 *
 * Cache invalidation: invalida discover + post cache. A scala alta
 * passeremo a precaricamento del Set in KV (vedi
 * project_block_kv_set_followup).
 */
export async function toggleUserBlock(
  input: z.input<typeof ToggleUserBlockInputSchema>,
): Promise<ActionResult<{ blocked: boolean }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = ToggleUserBlockInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  if (parsed.data.blockedUserId === user.id) {
    return fail("posts.errors.cannot_block_self");
  }

  // Verifica che l'utente target esista (defense in depth — l'UI non
  // dovrebbe mai chiamare con un id invalido, ma evita 500 da CASCADE).
  const target = await db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, parsed.data.blockedUserId))
    .limit(1);
  if (!target[0]) return fail(I18N.notFound);

  const result = await blocksToggleService(user.id, parsed.data.blockedUserId);

  // Invalidazione cache: il viewer non vede più post del bloccato e
  // viceversa. Conservativo: nuke discover + feed personale di entrambi.
  await feedInvalidate("discover");
  await feedInvalidate({ user: user.id });
  await feedInvalidate({ user: parsed.data.blockedUserId });

  // Invalida la Next.js Router Cache (client-side RSC payload) di
  // tutto il route group (protected). Necessario perché il viewer,
  // dopo block, navigando back nel browser tornerebbe a una post
  // page hidratata con il post ora bloccato. revalidatePath con
  // type='layout' invalida sia /, sia /post/[id], sia /profile/*, sia
  // /explore — granular tag invalidation richiederebbe sapere quali
  // post-id dell'autore bloccato sono in cache nel viewer, info non
  // disponibile server-side. Block è azione rara → costo trascurabile.
  revalidatePath("/", "layout");

  return { ok: true, data: result };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — Report
// ─────────────────────────────────────────────────────────────────────────

/** Esporta la lista di motivi attivi al client (consumato dal report
 *  modal della PostCard). Letta on-demand quando il modal si apre: la
 *  settings cache già la rende cheap. Nessuna PII, safe to expose. */
export async function getReportReasonsForClient(): Promise<ReportReason[]> {
  return await getActiveReportReasons();
}

export async function reportPost(
  input: z.input<typeof ReportPostInputSchema>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = ReportPostInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Reason key validato contro la lista admin-editable corrente. Se
  // l'admin ha disabilitato/rimosso una reason mentre l'utente aveva
  // il modal aperto → rifiuta gracefully, il client re-fetcha.
  const reasonDef = await findActiveReportReason(parsed.data.reason);
  if (!reasonDef) return fail("posts.errors.reason_not_available");

  // requiresDetails (es. "other") deve avere details non vuoti.
  const details = (parsed.data.details ?? "").trim();
  if (reasonDef.requiresDetails && details.length === 0) {
    return fail("posts.errors.details_required", { field: "details" });
  }

  const rl = await rateLimitCheck(user.id, "report");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  // Verifica che il post esiste (no check su deleted_at: un post cancellato
  // può comunque essere report-ato — la queue admin lo vedrà tombstoned).
  const target = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.id, parsed.data.postId))
    .limit(1);

  if (!target[0]) return fail(I18N.notFound);

  await db.insert(postsReports).values({
    postId: parsed.data.postId,
    reporterId: user.id,
    reason: parsed.data.reason,
    details: details.length > 0 ? details : null,
  });

  return { ok: true };
}
