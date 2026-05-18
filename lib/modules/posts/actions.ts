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
import { SignJWT } from "jose";
import { z } from "zod";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  posts,
  postsComments,
  postsMedia,
  postsTickers,
  postsMentions,
  postsReports,
  postsUserPreferences,
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
  addCommentReaction as commentReactionsAddService,
  removeCommentReaction as commentReactionsRemoveService,
} from "./services/comment-reactions";
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
import {
  getInitialRepliesForRoots,
  getRepliesForComment,
  getRootCommentsForPost,
} from "./queries";
import type { CommentCardData, CommentRootCardData } from "./types";

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

const ToggleCommentReactionInputSchema = z.object({
  commentId: UuidSchema,
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
  // Il quote ha la SUA visibility, scelta dall'utente. NON eredita quella
  // del target (privacy paradox: quotare un public con visibility members
  // restringe la diffusione del mio commento; quotare un members con
  // visibility public NON allarga il target — l'embed viene gated server-side
  // in hydration). Default 'public' se omesso (back-compat client legacy).
  visibility: VisibilitySchema.default("public"),
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
): Promise<{ tickers: string[]; mentionUserIds: string[] }> {
  const tickers = await extractTickers(body);
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

  return { tickers: Array.from(tickers), mentionUserIds };
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

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(posts)
      .values({
        authorId: user.id,
        body: bodyCheck.body,
        visibility: parsed.data.visibility,
      })
      .returning({ id: posts.id, createdAt: posts.createdAt });
    const synced = await syncTickersAndMentions(
      tx,
      inserted.id,
      bodyCheck.body,
      inserted.createdAt,
    );

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
    return { postId: inserted.id, ...synced };
  });

  await feedInvalidate("discover");
  await feedInvalidate({ followersOf: user.id });
  await feedInvalidate({ profile: user.id });
  for (const t of created.tickers) await feedInvalidate({ ticker: t });
  for (const m of created.mentionUserIds) await feedInvalidate({ mentionsOf: m });

  // Sticky visibility: l'ultima visibility scelta diventa il default per i
  // post successivi (sticky cross-device, vedi posts_user_preferences).
  // Best-effort: fallimento qui non rompe la create già committata.
  try {
    await db
      .insert(postsUserPreferences)
      .values({ userId: user.id, defaultVisibility: parsed.data.visibility })
      .onConflictDoUpdate({
        target: postsUserPreferences.userId,
        set: {
          defaultVisibility: parsed.data.visibility,
          updatedAt: sql`NOW()`,
        },
      });
  } catch {
    // swallow: la preferenza è un nice-to-have, non blocca la pubblicazione
  }

  return { ok: true, data: { postId: created.postId } };
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

  // Cattura ticker/mentions PRIMA del clear per invalidare anche le
  // chiavi dei ticker/mention RIMOSSI dall'edit (non solo quelli nuovi).
  const previousTickers = await db
    .select({ ticker: postsTickers.ticker })
    .from(postsTickers)
    .where(eq(postsTickers.postId, parsed.data.postId));
  const previousMentions = await db
    .select({ uid: postsMentions.mentionedUserId })
    .from(postsMentions)
    .where(eq(postsMentions.postId, parsed.data.postId));

  const synced = await db.transaction(async (tx) => {
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
    return syncTickersAndMentions(
      tx,
      parsed.data.postId,
      bodyCheck.body,
      post.createdAt,
    );
  });

  await postInvalidate(parsed.data.postId);
  // Visibility cambiata = il post può uscire da Discover o profilo pubblico
  await feedInvalidate("discover");
  await feedInvalidate({ profile: user.id });
  // Invalidate ticker/mentions sia per quelli vecchi (potrebbero essere
  // stati rimossi dall'edit) sia per quelli nuovi.
  const tickerSet = new Set<string>([
    ...previousTickers.map((t) => t.ticker),
    ...synced.tickers,
  ]);
  const mentionSet = new Set<string>([
    ...previousMentions.map((m) => m.uid),
    ...synced.mentionUserIds,
  ]);
  for (const t of tickerSet) await feedInvalidate({ ticker: t });
  for (const m of mentionSet) await feedInvalidate({ mentionsOf: m });

  return { ok: true };
}

export async function softDeletePost(
  input: { postId: string },
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const parsed = UuidSchema.safeParse(input.postId);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Cattura ticker/mentions del post PRIMA del soft-delete per invalidare
  // anche le rispettive cache (il post sparirà da /feed?ticker=X e /mentions).
  const [tickersBefore, mentionsBefore] = await Promise.all([
    db
      .select({ ticker: postsTickers.ticker })
      .from(postsTickers)
      .where(eq(postsTickers.postId, parsed.data)),
    db
      .select({ uid: postsMentions.mentionedUserId })
      .from(postsMentions)
      .where(eq(postsMentions.postId, parsed.data)),
  ]);

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
  for (const t of tickersBefore) await feedInvalidate({ ticker: t.ticker });
  for (const m of mentionsBefore) await feedInvalidate({ mentionsOf: m.uid });

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

/**
 * Toggle reazione su un commento. Stessa quota rate-limit del toggle
 * sui post (`modules.posts.rate_limit_reaction_per_min`): un user che
 * reagisce molto reagisce molto, indipendentemente dal target.
 *
 * Counter denormalizzati su `posts_comments` aggiornati dal trigger
 * DB `posts_comment_reactions_counter_trg` (M_posts_008).
 *
 * Invalidation: lookup post_id del commento per invalidare la cache
 * del post target — i counters del commento sono parte del payload
 * `getPostCardWithThread` cachato.
 */
export async function toggleCommentReaction(
  input: z.input<typeof ToggleCommentReactionInputSchema>,
): Promise<ActionResult<{ active: boolean }>> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);
  if (user.bannedAt) return fail(I18N.banned);

  const parsed = ToggleCommentReactionInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const rl = await rateLimitCheck(user.id, "reaction");
  if (!rl.ok) return fail(I18N.rateLimited, { retryAfter: rl.retryAfter });

  const removed = await commentReactionsRemoveService(
    parsed.data.commentId,
    user.id,
    parsed.data.reaction,
  );
  if (removed.removed) {
    await invalidatePostByCommentId(parsed.data.commentId);
    return { ok: true, data: { active: false } };
  }
  const inserted = await commentReactionsAddService(
    parsed.data.commentId,
    user.id,
    parsed.data.reaction,
  );
  await invalidatePostByCommentId(parsed.data.commentId);
  return { ok: true, data: { active: inserted.inserted } };
}

/** Lookup interno: data un commentId, recupera il post_id e invalida
 *  la cache del post. Quando arriverà una cache dedicata ai commenti,
 *  qui invalideremo entrambe. */
async function invalidatePostByCommentId(commentId: string): Promise<void> {
  const row = await db
    .select({ postId: postsComments.postId })
    .from(postsComments)
    .where(eq(postsComments.id, commentId))
    .limit(1);
  if (row[0]) await postInvalidate(row[0].postId);
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

const LoadInitialCommentsSchema = z.object({
  postId: UuidSchema,
  perRoot: z.number().int().min(0).max(10).optional(),
});

const LoadMoreRootCommentsSchema = z.object({
  postId: UuidSchema,
  cursor: z.string().optional(),
});

const LoadMoreRepliesSchema = z.object({
  parentCommentId: UuidSchema,
  cursor: z.string().optional(),
});

const PollCommentsSignalSchema = z.object({
  postId: UuidSchema,
  since: z.string().datetime(),
});

/**
 * Carica il primo set di root commenti + reply iniziali per un post.
 * Usato dall'inline expand del feed (lazy fetch on-expand). Su /post/[id]
 * la page lo prefetcha lato SSR direttamente con la query, senza passare
 * da qui.
 *
 * 2 query: getRootCommentsForPost (root + repliesCount) +
 * getInitialRepliesForRoots (window function ROW_NUMBER) — niente N+1.
 */
export async function loadInitialCommentsAction(
  input: z.input<typeof LoadInitialCommentsSchema>,
): Promise<
  ActionResult<{
    root: CommentRootCardData[];
    replies: Record<string, CommentCardData[]>;
    nextRootCursor: string | null;
  }>
> {
  const parsed = LoadInitialCommentsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const user = await getUser();
  const viewerId = user?.id;

  const rootPage = await getRootCommentsForPost({
    postId: parsed.data.postId,
    viewerUserId: viewerId,
  });

  const rootIds = rootPage.comments.map((c) => c.id);
  const replies =
    rootIds.length === 0
      ? {}
      : await getInitialRepliesForRoots({
          rootIds,
          perRoot: parsed.data.perRoot ?? 3,
          viewerUserId: viewerId,
        });

  return {
    ok: true,
    data: {
      root: rootPage.comments,
      replies,
      nextRootCursor: rootPage.nextCursor,
    },
  };
}

export async function loadMoreRootCommentsAction(
  input: z.input<typeof LoadMoreRootCommentsSchema>,
): Promise<
  ActionResult<{
    root: CommentRootCardData[];
    replies: Record<string, CommentCardData[]>;
    nextRootCursor: string | null;
  }>
> {
  const parsed = LoadMoreRootCommentsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const user = await getUser();
  const viewerId = user?.id;

  const rootPage = await getRootCommentsForPost({
    postId: parsed.data.postId,
    viewerUserId: viewerId,
    cursor: parsed.data.cursor,
  });

  const rootIds = rootPage.comments.map((c) => c.id);
  const replies =
    rootIds.length === 0
      ? {}
      : await getInitialRepliesForRoots({
          rootIds,
          perRoot: 3,
          viewerUserId: viewerId,
        });

  return {
    ok: true,
    data: {
      root: rootPage.comments,
      replies,
      nextRootCursor: rootPage.nextCursor,
    },
  };
}

export async function loadMoreRepliesAction(
  input: z.input<typeof LoadMoreRepliesSchema>,
): Promise<ActionResult<{ replies: CommentCardData[]; nextCursor: string | null }>> {
  const parsed = LoadMoreRepliesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const user = await getUser();
  const viewerId = user?.id;

  const page = await getRepliesForComment({
    parentCommentId: parsed.data.parentCommentId,
    viewerUserId: viewerId,
    cursor: parsed.data.cursor,
  });

  return {
    ok: true,
    data: { replies: page.replies, nextCursor: page.nextCursor },
  };
}

/**
 * Genera un JWT custom firmato con SUPABASE_JWT_SECRET per autenticare
 * il client al servizio Supabase Realtime su channel PRIVATE (post
 * visibility != 'public'). Non usiamo Supabase Auth, quindi forniamo
 * un JWT minimale con `sub` (= our user id) + `role: authenticated` +
 * scadenza 1h. La RLS policy `comments_topic_read` su realtime.messages
 * legge `auth.jwt() ->> 'sub'` per il visibility gate.
 *
 * Re-fetched dal client periodicamente (50 min cadenza, vedi
 * useCommentsLiveSignal) per evitare scadenza durante sessione lunga.
 */
export async function generateRealtimeAuthToken(): Promise<
  ActionResult<{ token: string; expiresAt: number }>
> {
  const user = await getUser();
  if (!user) return fail(I18N.unauthenticated);

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return fail("posts.errors.realtime_jwt_missing_secret");

  // exp = now + 1h. Lasciamo 10min di margine per il client refresh.
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const token = await new SignJWT({
    sub: user.id,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  return { ok: true, data: { token, expiresAt: exp } };
}

/**
 * Server Action consumata da `useCommentsLiveSignal` in modalità "poll".
 * Ritorna il NUMERO di commenti non-deleted inseriti su `postId` dopo
 * `since`. Conta solo: visibility ereditata, block filter, deleted_at IS
 * NULL. Niente body, niente JOIN — pura COUNT veloce.
 */
export async function pollCommentsSignalAction(
  input: z.input<typeof PollCommentsSignalSchema>,
): Promise<ActionResult<{ newCount: number }>> {
  const parsed = PollCommentsSignalSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const user = await getUser();
  const viewerId = user?.id;

  // Verifica veloce che il post esiste e non è soft-deleted.
  const target = await db
    .select({ id: posts.id, visibility: posts.visibility, authorId: posts.authorId, deletedAt: posts.deletedAt })
    .from(posts)
    .where(eq(posts.id, parsed.data.postId))
    .limit(1);
  if (!target[0] || target[0].deletedAt) return fail(I18N.notFound);

  // Visibility gate semplificato: se è private/followers e viewer non è
  // l'autore, ritorna 0 (niente leak di esistenza).
  const vis = target[0].visibility as PostVisibility;
  if ((vis === "private" || vis === "followers") && target[0].authorId !== viewerId) {
    return { ok: true, data: { newCount: 0 } };
  }
  if (vis === "members" && !viewerId) {
    return { ok: true, data: { newCount: 0 } };
  }

  const since = new Date(parsed.data.since);
  const sinceIso = since.toISOString();
  const blockFilterSql = viewerId
    ? sql`AND NOT EXISTS (
        SELECT 1 FROM posts_user_blocks b
        WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = c.author_id)
           OR (b.blocked_id = ${viewerId}::uuid AND b.blocker_id = c.author_id)
      )`
    : sql``;

  const result = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt FROM posts_comments c
    WHERE c.post_id = ${parsed.data.postId}::uuid
      AND c.deleted_at IS NULL
      AND c.created_at > ${sinceIso}
      ${blockFilterSql}
  `);
  const rows = Array.from(result as unknown as Array<{ cnt: string }>);
  const row = rows[0];
  const newCount = row ? parseInt(row.cnt, 10) || 0 : 0;
  return { ok: true, data: { newCount } };
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

  // Verifica che il target esiste e non è soft-deleted. Self-repost
  // ammesso: pattern Twitter "ricommento un mio post di 2 anni fa".
  // L'hydration applica visibility-gating sull'embed target, quindi
  // un viewer senza accesso al target vede solo tombstone.
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

  const postId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(posts)
      .values({
        authorId: user.id,
        body: bodyCheck.body,
        visibility: parsed.data.visibility,
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

  // Sticky visibility: anche il quote contribuisce alla preferenza
  // (best-effort, non blocca la create già committata).
  try {
    await db
      .insert(postsUserPreferences)
      .values({ userId: user.id, defaultVisibility: parsed.data.visibility })
      .onConflictDoUpdate({
        target: postsUserPreferences.userId,
        set: {
          defaultVisibility: parsed.data.visibility,
          updatedAt: sql`NOW()`,
        },
      });
  } catch {
    // swallow
  }

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
