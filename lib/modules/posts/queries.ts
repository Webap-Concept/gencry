// lib/modules/posts/queries.ts
//
// Read path del modulo Posts. Pattern: separazione listing (ID-only) vs
// hydration (PostCardData batch). Tutti i feed restituiscono cursor
// keyset su (created_at, id) — niente OFFSET, scala lineare con N posts.
//
// Layer di caching (hookable):
//   - getCachedFeedIds(key, fallback)  → KV `feed:{key}` TTL ~60s in V2
//   - getCachedPosts(ids,  fallback)   → KV `post:{id}` TTL ~5min in V2
// In V1 entrambi sono pass-through (vedi services/{feed,post}-cache.ts).
// Tutte le query feed-ids passano da getCachedFeedIds così quando KV
// arriva non dobbiamo cercare i call site.
//
// Visibility enforcement: gestita SQL-side. Le query NON ritornano post
// che il viewer non ha diritto di vedere — il filtraggio successivo in
// UI è una difesa in profondità, non la fonte di verità.
import { and, asc, desc, eq, gt, inArray, isNull, isNotNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/drizzle";
import {
  POST_REACTION_KINDS,
  posts,
  postsBookmarks,
  postsComments,
  postsMedia,
  postsMentions,
  postsReactions,
  postsReports,
  postsTickers,
  userProfiles,
  type PostReactionKind,
  type PostReport,
  type PostVisibility,
} from "@/lib/db/schema";
import { getCachedFeedIds } from "./services/feed-cache";
import { getCachedPosts } from "./services/post-cache";
import { isBlockedBetween, notBlockedBy } from "./services/blocks";
import { cursorFromRow, decodeCursor, encodeCursor } from "./lib/cursor";
import type {
  CommentCardData,
  CommentRepliesPage,
  CommentRootCardData,
  CommentsPage,
  CommentsRootPage,
  PostAuthorPublic,
  PostCardData,
  PostCounts,
  PostListPage,
  PostMediaPublic,
  PostViewerState,
} from "./types";

const DEFAULT_PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────
// Helpers — visibility predicates and cursor keyset clause
// ─────────────────────────────────────────────────────────────────────────

/**
 * Predicato visibility per il feed "Discover" (e per Ticker/Mentions):
 *   - viewer anonimo → solo `public`
 *   - viewer loggato → `public` + `members` + tutti i PROPRI post
 *     (qualunque visibility), così l'autore non "perde" i suoi
 *     `followers`/`private` quando guarda il feed home — coerente con
 *     come `getProfileFeedIds` già si comporta sul proprio profilo.
 */
function discoverVisibilityClause(viewerUserId: string | undefined) {
  const allowed: PostVisibility[] = viewerUserId
    ? ["public", "members"]
    : ["public"];
  if (!viewerUserId) return inArray(posts.visibility, allowed);
  return or(
    inArray(posts.visibility, allowed),
    eq(posts.authorId, viewerUserId),
  );
}

/**
 * Predicato visibility per profilo utente:
 *   - viewer è l'autore → tutto incluso `private`
 *   - viewer loggato non-autore → `public` + `members` (+ `followers`
 *     quando arriverà il modulo follows; per ora chi non è autore non
 *     vede `followers` perché manca il graph per certificarlo)
 *   - viewer anonimo → solo `public`
 */
function profileVisibilityClause(
  authorId: string,
  viewerUserId: string | undefined,
) {
  if (viewerUserId && viewerUserId === authorId) {
    return undefined; // tutto
  }
  const allowed: PostVisibility[] = viewerUserId
    ? ["public", "members"]
    : ["public"];
  return inArray(posts.visibility, allowed);
}

/**
 * Keyset clause (created_at, id) < (cursor.ms, cursor.id). Equivalente
 * a tuple comparison espressa via OR/AND su 2 colonne per usare l'index
 * composito (created_at DESC, id DESC).
 */
function cursorClause(cursor: ReturnType<typeof decodeCursor>) {
  if (!cursor) return undefined;
  const cursorDate = new Date(cursor.ms);
  return or(
    lt(posts.createdAt, cursorDate),
    and(eq(posts.createdAt, cursorDate), lt(posts.id, cursor.id)),
  );
}

/** Keyset cursor per posts_comments in ordine DESC (più recenti
 *  prima). Decisione 2026-05-17: anche le reply seguono DESC come i
 *  root per coerenza UX. */
function cursorClauseCommentsDesc(cursor: ReturnType<typeof decodeCursor>) {
  if (!cursor) return undefined;
  const cursorDate = new Date(cursor.ms);
  return or(
    lt(postsComments.createdAt, cursorDate),
    and(eq(postsComments.createdAt, cursorDate), lt(postsComments.id, cursor.id)),
  );
}

/**
 * Filtro block per query "post-centric" (autore della row = posts.author_id).
 * Anonymous (no viewerUserId) → nessun filtro. Loggato → NOT EXISTS sui
 * `posts_user_blocks` in entrambe le direzioni (mutual). Vedi service
 * `notBlockedBy` per il dettaglio del fragment SQL.
 */
function viewerNotBlockedOnPosts(viewerUserId: string | undefined) {
  if (!viewerUserId) return undefined;
  return notBlockedBy(viewerUserId, posts.authorId);
}

/** Variante per JOIN su posts_comments (autore = posts_comments.author_id). */
function viewerNotBlockedOnComments(viewerUserId: string | undefined) {
  if (!viewerUserId) return undefined;
  return notBlockedBy(viewerUserId, postsComments.authorId);
}

/**
 * Trasforma una lista di righe `(id, createdAt)` paginate +1 in un
 * `PostListPage`: separa il LIMIT sentinel e calcola il nextCursor.
 */
function toListPage(
  rows: Array<{ id: string; createdAt: Date }>,
  pageSize: number,
): PostListPage {
  if (rows.length <= pageSize) {
    return { ids: rows.map((r) => r.id), nextCursor: null };
  }
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    ids: page.map((r) => r.id),
    nextCursor: encodeCursor(cursorFromRow(last)),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Feed-IDs queries (listing-only, no hydration)
// ─────────────────────────────────────────────────────────────────────────

export type FeedTab = "discover" | "following";

/**
 * Dispatcher per il feed home. Per `following`: stub deterministico che
 * ritorna empty page finché non arriva il modulo `follows` (non ancora
 * installato — vedi project_module_posts_architecture §1). Quando
 * arriverà, sostituire il body con il JOIN posts × follows.
 */
export async function getFeedIds(opts: {
  tab: FeedTab;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);

  if (opts.tab === "following") {
    // TODO(follows-module): replace with JOIN posts × follows when
    // the follows module ships. Until then Following is empty so the
    // UI can show the "start following" empty state CTA.
    return { ids: [], nextCursor: null };
  }

  return getCachedFeedIds(
    `discover:${opts.viewerUserId ?? "anon"}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            isNull(posts.deletedAt),
            discoverVisibilityClause(opts.viewerUserId),
            viewerNotBlockedOnPosts(opts.viewerUserId),
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

export async function getProfileFeedIds(opts: {
  authorId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  return getCachedFeedIds(
    `profile:${opts.authorId}:${opts.viewerUserId ?? "anon"}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, opts.authorId),
            isNull(posts.deletedAt),
            profileVisibilityClause(opts.authorId, opts.viewerUserId),
            viewerNotBlockedOnPosts(opts.viewerUserId),
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

export async function getTickerFeedIds(opts: {
  ticker: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  // Ticker normalizzato uppercase (CHECK SQL li impone così).
  const tickerNorm = opts.ticker.toUpperCase();
  return getCachedFeedIds(
    `ticker:${tickerNorm}:${opts.viewerUserId ?? "anon"}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(postsTickers)
        .innerJoin(posts, eq(posts.id, postsTickers.postId))
        .where(
          and(
            eq(postsTickers.ticker, tickerNorm),
            isNull(posts.deletedAt),
            discoverVisibilityClause(opts.viewerUserId),
            viewerNotBlockedOnPosts(opts.viewerUserId),
            cursor
              ? or(
                  lt(postsTickers.createdAt, new Date(cursor.ms)),
                  and(
                    eq(postsTickers.createdAt, new Date(cursor.ms)),
                    lt(posts.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(postsTickers.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

export async function getBookmarkFeedIds(opts: {
  viewerUserId: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  return getCachedFeedIds(
    `bookmarks:${opts.viewerUserId}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      // Ordine: per `posts_bookmarks.created_at` (quando l'utente ha
      // bookmarkato), non per `posts.created_at`. UX migliore: il "primo
      // bookmark" sta in cima.
      const rows = await db
        .select({
          id: posts.id,
          // Esponiamo come createdAt il timestamp di bookmark per ricostruire
          // il cursor coerentemente; le UI userà comunque l'ordine di ritorno.
          createdAt: postsBookmarks.createdAt,
        })
        .from(postsBookmarks)
        .innerJoin(posts, eq(posts.id, postsBookmarks.postId))
        .where(
          and(
            eq(postsBookmarks.userId, opts.viewerUserId),
            isNull(posts.deletedAt),
            cursor
              ? or(
                  lt(postsBookmarks.createdAt, new Date(cursor.ms)),
                  and(
                    eq(postsBookmarks.createdAt, new Date(cursor.ms)),
                    lt(posts.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(postsBookmarks.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

export async function getMentionsFeedIds(opts: {
  /** Utente le cui menzioni vogliamo (es. /profile/{me}/mentions). */
  targetUserId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  return getCachedFeedIds(
    `mentions:${opts.targetUserId}:${opts.viewerUserId ?? "anon"}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: postsMentions.createdAt })
        .from(postsMentions)
        .innerJoin(posts, eq(posts.id, postsMentions.postId))
        .where(
          and(
            eq(postsMentions.mentionedUserId, opts.targetUserId),
            isNull(posts.deletedAt),
            discoverVisibilityClause(opts.viewerUserId),
            viewerNotBlockedOnPosts(opts.viewerUserId),
            cursor
              ? or(
                  lt(postsMentions.createdAt, new Date(cursor.ms)),
                  and(
                    eq(postsMentions.createdAt, new Date(cursor.ms)),
                    lt(posts.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(postsMentions.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Hydration: getPostsByIds(ids) → PostCardData[]
// ─────────────────────────────────────────────────────────────────────────

type RawPostRow = {
  id: string;
  authorId: string;
  body: string;
  visibility: string;
  repostOfId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  reactionsLike: number;
  reactionsBullish: number;
  reactionsBearish: number;
  reactionsToTheMoon: number;
  reactionsDump: number;
  commentsCount: number;
  repostsCount: number;
  bookmarksCount: number;
  authorUsername: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorAvatarUrl: string | null;
  authorHeadline: string | null;
};

function rowToCardCore(row: RawPostRow): Omit<PostCardData, "repostOf" | "repostOfTombstone" | "viewer" | "tickers" | "media"> & {
  authorId: string;
  repostOfId: string | null;
} {
  const author: PostAuthorPublic = {
    id: row.authorId,
    username: row.authorUsername,
    firstName: row.authorFirstName,
    lastName: row.authorLastName,
    avatarUrl: row.authorAvatarUrl,
    headline: row.authorHeadline,
  };
  const counts: PostCounts = {
    reactions: {
      like:        row.reactionsLike,
      bullish:     row.reactionsBullish,
      bearish:     row.reactionsBearish,
      to_the_moon: row.reactionsToTheMoon,
      dump:        row.reactionsDump,
    },
    reactionsTotal:
      row.reactionsLike +
      row.reactionsBullish +
      row.reactionsBearish +
      row.reactionsToTheMoon +
      row.reactionsDump,
    comments:  row.commentsCount,
    reposts:   row.repostsCount,
    bookmarks: row.bookmarksCount,
  };
  return {
    id: row.id,
    authorId: row.authorId,
    author,
    body: row.body,
    visibility: row.visibility as PostVisibility,
    repostOfId: row.repostOfId,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    counts,
  };
}

/**
 * Query "core" posts + author info per N ids. Esclude i soft-deleted.
 * Visibility:
 *   - default: NON riapplicata, fonte di verità è getFeedIds() per i feed
 *     e getPostBySlug() per single-post.
 *   - enforceVisibility: true → filtro SQL aggiuntivo che esclude righe
 *     che il viewer non ha diritto di vedere. USATO per repost embed
 *     target: il quote-poster sceglie la visibility del suo quote, ma
 *     l'embed del target deve rispettare la visibility del TARGET (no
 *     leak). Quando il filtro elimina la row, la UI cade su tombstone
 *     con reason 'not_visible'.
 *     Gate per kind:
 *       public    → sempre ok
 *       members   → viewerUserId != null
 *       followers → viewerUserId == authorId (modulo follow non esiste
 *                   ancora: temporaneamente equivalente a 'private'.
 *                   Quando arriverà, aggiungere il join con la tabella
 *                   follow qui)
 *       private   → viewerUserId == authorId
 *
 * Filtro block (mutual) applicato sempre — se il viewer e l'autore hanno
 * una relazione di block, la row sparisce dall'hydration.
 */
async function selectPostsCore(
  ids: string[],
  viewerUserId?: string,
  opts: { enforceVisibility?: boolean } = {},
): Promise<RawPostRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      body: posts.body,
      visibility: posts.visibility,
      repostOfId: posts.repostOfId,
      editedAt: posts.editedAt,
      deletedAt: posts.deletedAt,
      createdAt: posts.createdAt,
      reactionsLike:      posts.reactionsLike,
      reactionsBullish:   posts.reactionsBullish,
      reactionsBearish:   posts.reactionsBearish,
      reactionsToTheMoon: posts.reactionsToTheMoon,
      reactionsDump:      posts.reactionsDump,
      commentsCount: posts.commentsCount,
      repostsCount: posts.repostsCount,
      bookmarksCount: posts.bookmarksCount,
      authorUsername: userProfiles.username,
      authorFirstName: userProfiles.firstName,
      authorLastName: userProfiles.lastName,
      authorAvatarUrl: userProfiles.avatarUrl,
      authorHeadline: userProfiles.headline,
    })
    .from(posts)
    .leftJoin(userProfiles, eq(userProfiles.userId, posts.authorId))
    .where(
      and(
        inArray(posts.id, ids),
        isNull(posts.deletedAt),
        viewerNotBlockedOnPosts(viewerUserId),
        opts.enforceVisibility
          ? viewerCanSeeVisibility(viewerUserId)
          : undefined,
      ),
    );
  return rows;
}

// Filtro visibility per un viewer. Restituisce condizione SQL che
// passa solo per le righe che il viewer può vedere. Usato per embed
// target del quote repost (NON per i feed: lì gestisce getFeedIds).
function viewerCanSeeVisibility(viewerUserId: string | undefined) {
  if (!viewerUserId) {
    // Viewer anonimo: solo public.
    return eq(posts.visibility, "public");
  }
  // Viewer loggato: public + members sempre; followers/private solo se
  // viewer == author (finché il modulo follow non sarà disponibile,
  // 'followers' è di fatto trattato come 'private').
  return or(
    inArray(posts.visibility, ["public", "members"]),
    eq(posts.authorId, viewerUserId),
  );
}

// Specchio JS del filtro SQL `viewerCanSeeVisibility`. Usato post-query
// per classificare un target embed mancante come 'not_visible' vs
// 'deleted'. Devono restare allineati (modificarli insieme).
function viewerCanSeeVisibilityJS(
  visibility: string,
  authorId: string,
  viewerUserId: string | undefined,
): boolean {
  if (visibility === "public") return true;
  if (!viewerUserId) return false;
  if (visibility === "members") return true;
  // followers + private: solo se viewer == author
  return authorId === viewerUserId;
}

async function selectMediaForPosts(
  postIds: string[],
): Promise<Map<string, PostMediaPublic[]>> {
  const map = new Map<string, PostMediaPublic[]>();
  if (postIds.length === 0) return map;
  const rows = await db
    .select({
      id: postsMedia.id,
      postId: postsMedia.postId,
      fullUrl: postsMedia.fullUrl,
      thumbUrl: postsMedia.thumbUrl,
      width: postsMedia.width,
      height: postsMedia.height,
      position: postsMedia.position,
    })
    .from(postsMedia)
    .where(
      and(
        inArray(postsMedia.postId, postIds),
        isNotNull(postsMedia.confirmedAt),
        isNotNull(postsMedia.fullUrl),
        isNotNull(postsMedia.thumbUrl),
      ),
    )
    .orderBy(asc(postsMedia.postId), asc(postsMedia.position));
  for (const m of rows) {
    if (!m.postId || !m.fullUrl || !m.thumbUrl) continue;
    const list = map.get(m.postId) ?? [];
    list.push({
      id: m.id,
      fullUrl: m.fullUrl,
      thumbUrl: m.thumbUrl,
      width: m.width,
      height: m.height,
      position: m.position,
    });
    map.set(m.postId, list);
  }
  return map;
}

async function selectTickersForPosts(
  postIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (postIds.length === 0) return map;
  const rows = await db
    .select({ postId: postsTickers.postId, ticker: postsTickers.ticker })
    .from(postsTickers)
    .where(inArray(postsTickers.postId, postIds));
  for (const r of rows) {
    const list = map.get(r.postId) ?? [];
    list.push(r.ticker);
    map.set(r.postId, list);
  }
  return map;
}

async function selectViewerStateForPosts(
  postIds: string[],
  viewerUserId: string,
): Promise<Map<string, PostViewerState>> {
  const map = new Map<string, PostViewerState>();
  if (postIds.length === 0) return map;
  const [reactions, bookmarks] = await Promise.all([
    db
      .select({
        postId: postsReactions.postId,
        reaction: postsReactions.reaction,
      })
      .from(postsReactions)
      .where(
        and(
          inArray(postsReactions.postId, postIds),
          eq(postsReactions.userId, viewerUserId),
        ),
      ),
    db
      .select({ postId: postsBookmarks.postId })
      .from(postsBookmarks)
      .where(
        and(
          inArray(postsBookmarks.postId, postIds),
          eq(postsBookmarks.userId, viewerUserId),
        ),
      ),
  ]);
  const bookmarkedSet = new Set(bookmarks.map((b) => b.postId));
  for (const id of postIds) {
    map.set(id, { ownReactions: [], bookmarked: bookmarkedSet.has(id) });
  }
  for (const r of reactions) {
    const v = map.get(r.postId);
    if (v && POST_REACTION_KINDS.includes(r.reaction as PostReactionKind)) {
      v.ownReactions.push(r.reaction as PostReactionKind);
    }
  }
  return map;
}

/**
 * Hydration batch. Preserva l'ordine di `ids` (importante per coerenza
 * con il cursor del feed listing). Posts cancellati o non trovati sono
 * filtrati silently.
 *
 * Repost target (depth=1): se A è quote-repost di B, B viene hydrato e
 * piazzato in A.repostOf. Se B non esiste o è cancellato → A.repostOf
 * resta null e A.repostOfTombstone = { id: B, reason }: 'deleted' se
 * B è soft/hard-deleted o block-filtrato, 'not_visible' se B esiste ma
 * il viewer non ha accesso (visibility members/followers/private).
 */
export async function getPostsByIds(
  ids: string[],
  opts: { viewerUserId?: string } = {},
): Promise<PostCardData[]> {
  if (ids.length === 0) return [];

  return getCachedPosts(ids, async (missingIds) => {
    // Step 1: core posts (filtra anche per block tra viewer e autore)
    const core = await selectPostsCore(missingIds, opts.viewerUserId);
    if (core.length === 0) return [];

    // Step 2: repost targets (depth 1) — anche il target è block-filtrato:
    // se il viewer ha bloccato l'autore del post originale, il quote
    // perde l'embed e cade su tombstone (UX corretta, niente leak).
    const repostTargetIds = Array.from(
      new Set(core.filter((p) => p.repostOfId).map((p) => p.repostOfId!)),
    );
    // enforceVisibility: il target embed deve rispettare la SUA visibility,
    // non quella del quote-poster. Se il viewer non ha accesso → tombstone
    // reason 'not_visible' (niente leak del body).
    const targetCore = repostTargetIds.length
      ? await selectPostsCore(repostTargetIds, opts.viewerUserId, {
          enforceVisibility: true,
        })
      : [];
    const targetCoreById = new Map(targetCore.map((p) => [p.id, p]));
    // Per i target che NON sono in targetCore, query light per distinguere
    // 'deleted' (hard-deleted o soft-deleted o block) vs 'not_visible'
    // (esiste ma visibility-gated). Block-filtered cade volutamente su
    // 'deleted' per non leakare la relazione di block.
    const missingTargetIds = repostTargetIds.filter(
      (id) => !targetCoreById.has(id),
    );
    const missingTargetMeta = missingTargetIds.length
      ? await db
          .select({
            id: posts.id,
            visibility: posts.visibility,
            authorId: posts.authorId,
            deletedAt: posts.deletedAt,
          })
          .from(posts)
          .where(inArray(posts.id, missingTargetIds))
      : [];
    const missingTargetById = new Map(
      missingTargetMeta.map((r) => [r.id, r]),
    );

    // Step 3: parallel batch — media, tickers, viewer state
    const allPostIds = [...core.map((p) => p.id), ...targetCore.map((p) => p.id)];
    const [mediaMap, tickerMap, viewerMap] = await Promise.all([
      selectMediaForPosts(allPostIds),
      selectTickersForPosts(allPostIds),
      opts.viewerUserId
        ? selectViewerStateForPosts(allPostIds, opts.viewerUserId)
        : Promise.resolve(new Map<string, PostViewerState>()),
    ]);

    // Step 4: assemble
    const assemble = (row: RawPostRow): PostCardData => {
      const coreCard = rowToCardCore(row);
      const card: PostCardData = {
        id: coreCard.id,
        author: coreCard.author,
        body: coreCard.body,
        visibility: coreCard.visibility,
        editedAt: coreCard.editedAt,
        createdAt: coreCard.createdAt,
        counts: coreCard.counts,
        repostOf: null,
        repostOfTombstone: null,
        tickers: tickerMap.get(row.id) ?? [],
        media: mediaMap.get(row.id) ?? [],
        viewer: opts.viewerUserId
          ? viewerMap.get(row.id) ?? { ownReactions: [], bookmarked: false }
          : null,
      };
      if (row.repostOfId) {
        const target = targetCoreById.get(row.repostOfId);
        if (target) {
          const targetCore = rowToCardCore(target);
          card.repostOf = {
            id: targetCore.id,
            author: targetCore.author,
            body: targetCore.body,
            visibility: targetCore.visibility,
            editedAt: targetCore.editedAt,
            createdAt: targetCore.createdAt,
            counts: targetCore.counts,
            repostOf: null, // niente recursion oltre depth 1
            repostOfTombstone: null,
            tickers: tickerMap.get(target.id) ?? [],
            media: mediaMap.get(target.id) ?? [],
            viewer: opts.viewerUserId
              ? viewerMap.get(target.id) ?? { ownReactions: [], bookmarked: false }
              : null,
          };
        } else {
          // Distinguo 'deleted' vs 'not_visible' usando la query light
          // su missingTargetById. Block-filtered cade su 'deleted'.
          const meta = missingTargetById.get(row.repostOfId);
          const reason: "deleted" | "not_visible" =
            meta &&
            !meta.deletedAt &&
            !viewerCanSeeVisibilityJS(
              meta.visibility,
              meta.authorId,
              opts.viewerUserId,
            )
              ? "not_visible"
              : "deleted";
          card.repostOfTombstone = { id: row.repostOfId, reason };
        }
      }
      return card;
    };

    return core.map(assemble);
  }).then((hydrated) => {
    // Preserva ordine ids; filtra missing (deleted/non-existent).
    const byId = new Map(hydrated.map((c) => [c.id, c]));
    return ids.flatMap((id) => {
      const c = byId.get(id);
      return c ? [c] : [];
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Singolo post (URL canonica, SEO, share link)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Singolo post con check visibility esplicito. Da usare per la pagina
 * `/post/{id}`:
 *   - Ritorna null se: non esiste, è soft-deleted, viewer NON ha diritto
 *     di vedere la visibility. Il chiamante deve mappare null → 404 (non
 *     403, per non rivelare l'esistenza — vedi project_module_posts §SEO).
 */
/** Regex UUID standard (8-4-4-4-12 hex). Bocca early i postId non-UUID
 *  (es. typo in URL) per evitare che Postgres lanci 22P02 invalid_text_
 *  representation. Il caller riceve null e renderizza 404. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPostBySlug(
  postId: string,
  opts: { viewerUserId?: string } = {},
): Promise<PostCardData | null> {
  if (!UUID_REGEX.test(postId)) return null;

  const [meta] = await db
    .select({
      authorId: posts.authorId,
      visibility: posts.visibility,
      deletedAt: posts.deletedAt,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!meta || meta.deletedAt) return null;

  // Block check: se viewer e autore sono in block (qualunque direzione)
  // → 404 invece di 403 (nascondi esistenza).
  if (
    opts.viewerUserId &&
    (await isBlockedBetween(opts.viewerUserId, meta.authorId))
  ) {
    return null;
  }

  // Visibility gate identico a profileVisibilityClause(authorId, viewer),
  // ma valutato a TS-side perché abbiamo già la row.
  const v = meta.visibility as PostVisibility;
  if (v === "private" && meta.authorId !== opts.viewerUserId) return null;
  if (v === "followers" && meta.authorId !== opts.viewerUserId) {
    // Senza modulo follows non possiamo verificare il graph → trattiamo
    // come not-found (anche l'autore di una `followers` post non perde
    // accesso, ma chiunque altro sì).
    return null;
  }
  if (v === "members" && !opts.viewerUserId) return null;

  const [card] = await getPostsByIds([postId], opts);
  return card ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// SEO — sitemap dei post pubblici
// ─────────────────────────────────────────────────────────────────────────

/**
 * Lista compatta (id + createdAt) dei post indicizzabili per la sitemap
 * `/post/sitemap.xml`. Filtra:
 *   - visibility = 'public' (solo questi sono visibili ai bot anonimi)
 *   - deleted_at IS NULL
 *
 * Cap a 5000 entries ordinati per createdAt DESC: sitemap.org accetta
 * fino a 50k URLs per file, ma a quel volume vale la pena passare a
 * sitemap index. Sotto 5k è 1 sola sitemap, semplice.
 *
 * createdAt usato come `lastModified` perché i post non vengono editati
 * dopo 10min e l'edit non cambia la URL — il timestamp di creazione è
 * un proxy onesto per il crawler. Edit-window expanded a editedAt
 * quando arriverà la moderation di admin-edit.
 */
export async function getPublicPostsForSitemap(): Promise<
  Array<{ id: string; createdAt: Date }>
> {
  const rows = await db
    .select({
      id: posts.id,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(eq(posts.visibility, "public"), isNull(posts.deletedAt)),
    )
    .orderBy(desc(posts.createdAt))
    .limit(5000);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Comments — thread cursor-paginated, 2-livelli visual (root + replies)
// ─────────────────────────────────────────────────────────────────────────
//
// Pattern (vedi memory project_module_posts.md §Interazioni):
//   - Schema FLAT (1 colonna parent_comment_id), rendering 2-livelli visual.
//   - Root = parent_comment_id IS NULL; Reply = parent_comment_id NOT NULL.
//   - "Reply su reply" comunque collassano a livello 2 con `@user`
//     precompilato (gestito UI-side, schema resta piatto).
//
// Performance (M_posts_007_comments_indexes.sql):
//   - idx_posts_comments_root      → root listing 1 INDEX SCAN
//   - idx_posts_comments_replies   → reply listing + COUNT scalare 1 INDEX SCAN
//
// 3 funzioni esposte:
//   1) getRootCommentsForPost(postId)            → root paginate + repliesCount inline
//   2) getInitialRepliesForRoots(rootIds, perRoot) → prime N reply di N root in 1 query
//      (window function ROW_NUMBER) — evita N+1 a primo render del thread.
//   3) getRepliesForComment(parentId)            → on-demand "Mostra altre N risposte"

const ROOT_PAGE_SIZE = 15;
const REPLIES_PAGE_SIZE = 10;

/** Subquery scalare che ritorna l'array di reaction del viewer su un
 *  commento. Se viewer anonimo, ritorna `ARRAY[]::varchar[]`. Index-only
 *  scan grazie a idx_posts_comment_reactions_user_recent (M_posts_008). */
function viewerReactionsForCommentSql(viewerUserId?: string) {
  if (!viewerUserId) {
    return sql<string[]>`ARRAY[]::varchar[]`;
  }
  return sql<string[]>`COALESCE(
    (SELECT array_agg(r.reaction)
     FROM posts_comment_reactions r
     WHERE r.comment_id = ${postsComments.id}
       AND r.user_id = ${viewerUserId}::uuid),
    ARRAY[]::varchar[]
  )`;
}

type CommentRowSelection = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorId: string;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  authorUsername: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorAvatarUrl: string | null;
  authorHeadline: string | null;
  reactionsLike: number;
  reactionsBullish: number;
  reactionsBearish: number;
  reactionsToTheMoon: number;
  reactionsDump: number;
  /** Array di reaction kinds del viewer su questo commento. Array vuoto
   *  se viewer anonimo o se non ha reazionato. La regola "1 user → 1
   *  reaction" è applicativa, quindi in pratica length ≤ 1, ma il type
   *  è array per uniformità con PostViewerState.ownReactions. */
  viewerReactions: string[];
};

function rowToCommentCardData(
  r: CommentRowSelection,
  hasViewer: boolean,
): CommentCardData {
  const reactions = {
    like:        Number(r.reactionsLike)       || 0,
    bullish:     Number(r.reactionsBullish)    || 0,
    bearish:     Number(r.reactionsBearish)    || 0,
    to_the_moon: Number(r.reactionsToTheMoon)  || 0,
    dump:        Number(r.reactionsDump)       || 0,
  };
  const reactionsTotal =
    reactions.like +
    reactions.bullish +
    reactions.bearish +
    reactions.to_the_moon +
    reactions.dump;
  const ownReactions = (r.viewerReactions ?? []).filter((k): k is PostReactionKind =>
    POST_REACTION_KINDS.includes(k as PostReactionKind),
  );
  return {
    id: r.id,
    postId: r.postId,
    parentCommentId: r.parentCommentId,
    author: {
      id: r.authorId,
      username: r.authorUsername,
      firstName: r.authorFirstName,
      lastName: r.authorLastName,
      avatarUrl: r.authorAvatarUrl,
      headline: r.authorHeadline,
    },
    body: r.body,
    editedAt: r.editedAt,
    createdAt: r.createdAt,
    counts: { reactions, reactionsTotal },
    viewer: hasViewer ? { ownReactions } : null,
  };
}

/**
 * Root commenti di un post, paginated ASC su (created_at, id). Include
 * `repliesCount` come subquery scalare: 1 query per N root, ogni count è
 * un INDEX-ONLY SCAN su idx_posts_comments_replies (parziale, deleted_at
 * filter incluso nell'indice). Niente N+1.
 */
export async function getRootCommentsForPost(opts: {
  postId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<CommentsRootPage> {
  const pageSize = opts.pageSize ?? ROOT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);

  const repliesCountExpr = sql<number>`(
    SELECT COUNT(*)::int FROM ${postsComments} r
    WHERE r.parent_comment_id = ${postsComments.id}
      AND r.deleted_at IS NULL
  )`;

  const hasViewer = Boolean(opts.viewerUserId);
  const rows = await db
    .select({
      id: postsComments.id,
      postId: postsComments.postId,
      parentCommentId: postsComments.parentCommentId,
      authorId: postsComments.authorId,
      body: postsComments.body,
      editedAt: postsComments.editedAt,
      createdAt: postsComments.createdAt,
      authorUsername: userProfiles.username,
      authorFirstName: userProfiles.firstName,
      authorLastName: userProfiles.lastName,
      authorAvatarUrl: userProfiles.avatarUrl,
      authorHeadline: userProfiles.headline,
      reactionsLike:      postsComments.reactionsLike,
      reactionsBullish:   postsComments.reactionsBullish,
      reactionsBearish:   postsComments.reactionsBearish,
      reactionsToTheMoon: postsComments.reactionsToTheMoon,
      reactionsDump:      postsComments.reactionsDump,
      viewerReactions:    viewerReactionsForCommentSql(opts.viewerUserId),
      repliesCount: repliesCountExpr,
    })
    .from(postsComments)
    .leftJoin(userProfiles, eq(userProfiles.userId, postsComments.authorId))
    .where(
      and(
        eq(postsComments.postId, opts.postId),
        isNull(postsComments.parentCommentId),
        isNull(postsComments.deletedAt),
        viewerNotBlockedOnComments(opts.viewerUserId),
        cursorClauseCommentsDesc(cursor),
      ),
    )
    .orderBy(desc(postsComments.createdAt), desc(postsComments.id))
    .limit(pageSize + 1);

  const truncated = rows.length > pageSize ? rows.slice(0, pageSize) : rows;
  const comments: CommentRootCardData[] = truncated.map((r) => ({
    ...rowToCommentCardData(r, hasViewer),
    repliesCount: Number(r.repliesCount) || 0,
  }));

  const nextCursor =
    rows.length > pageSize
      ? encodeCursor(cursorFromRow(truncated[truncated.length - 1]))
      : null;

  return { comments, nextCursor };
}

/**
 * Prime N reply di una lista di root commenti, in 1 sola query con
 * window function ROW_NUMBER. Restituisce una mappa
 * `{ rootId: CommentCardData[] }`. Caller passa i root ids della pagina
 * corrente di `getRootCommentsForPost` (≤ ROOT_PAGE_SIZE root). Lookup
 * O(1) lato client, niente N+1.
 *
 * Se vuoi caricare MORE reply oltre `perRoot`, usa `getRepliesForComment`
 * on-demand col cursor della reply N-esima.
 */
export async function getInitialRepliesForRoots(opts: {
  rootIds: string[];
  perRoot?: number;
  viewerUserId?: string;
}): Promise<Record<string, CommentCardData[]>> {
  if (opts.rootIds.length === 0) return {};
  const perRoot = opts.perRoot ?? 3;

  // CTE con window function: ROW_NUMBER partitionato per parent_comment_id
  // ordinato ASC su (created_at, id), poi filtra rn <= perRoot.
  //
  // NB: il block check è SQL-side via NOT EXISTS in entrambe le direzioni.
  // Il viewer_id viene passato come parametro letterale per evitare di
  // dover gestire il caso "anonymous = nessun filtro" con sql.empty().
  const viewerId = opts.viewerUserId ?? "00000000-0000-0000-0000-000000000000";
  const applyBlockFilter = Boolean(opts.viewerUserId);

  const rootIdsSql = sql.join(opts.rootIds.map((id) => sql`${id}`), sql`, `);
  const blockClauseSql = applyBlockFilter
    ? sql`AND NOT EXISTS (
        SELECT 1 FROM posts_user_blocks b
        WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = c.author_id)
           OR (b.blocked_id = ${viewerId}::uuid AND b.blocker_id = c.author_id)
      )`
    : sql``;

  const viewerReactionsSql = applyBlockFilter
    ? sql`COALESCE(
        (SELECT array_agg(rr.reaction) FROM posts_comment_reactions rr
         WHERE rr.comment_id = c.id AND rr.user_id = ${viewerId}::uuid),
        ARRAY[]::varchar[]
      ) AS "viewerReactions"`
    : sql`ARRAY[]::varchar[] AS "viewerReactions"`;

  const result = await db.execute(sql<CommentRowSelection & { rn: number }>`
    WITH ranked AS (
      SELECT
        c.id, c.post_id AS "postId", c.parent_comment_id AS "parentCommentId",
        c.author_id AS "authorId", c.body, c.edited_at AS "editedAt",
        c.created_at AS "createdAt",
        up.username AS "authorUsername",
        up.first_name AS "authorFirstName",
        up.last_name AS "authorLastName",
        up.avatar_url AS "authorAvatarUrl",
        up.headline AS "authorHeadline",
        c.reactions_like         AS "reactionsLike",
        c.reactions_bullish      AS "reactionsBullish",
        c.reactions_bearish      AS "reactionsBearish",
        c.reactions_to_the_moon  AS "reactionsToTheMoon",
        c.reactions_dump         AS "reactionsDump",
        ${viewerReactionsSql},
        ROW_NUMBER() OVER (
          PARTITION BY c.parent_comment_id
          ORDER BY c.created_at DESC, c.id DESC
        ) AS rn
      FROM posts_comments c
      LEFT JOIN user_profiles up ON up.user_id = c.author_id
      WHERE c.parent_comment_id IN (${rootIdsSql})
        AND c.deleted_at IS NULL
        ${blockClauseSql}
    )
    SELECT * FROM ranked WHERE rn <= ${perRoot}
    ORDER BY "parentCommentId", "createdAt" DESC
  `);

  const rows = Array.from(result as unknown as CommentRowSelection[]);
  const grouped: Record<string, CommentCardData[]> = {};
  for (const r of rows) {
    const parentId = r.parentCommentId;
    if (!parentId) continue;
    if (!grouped[parentId]) grouped[parentId] = [];
    grouped[parentId].push(rowToCommentCardData(r, applyBlockFilter));
  }
  return grouped;
}

/**
 * Reply di un singolo root, paginate ASC. Usata per "Mostra altre N risposte"
 * dopo che `getInitialRepliesForRoots` ha già caricato le prime 3.
 */
export async function getRepliesForComment(opts: {
  parentCommentId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<CommentRepliesPage> {
  const pageSize = opts.pageSize ?? REPLIES_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);

  const hasViewer = Boolean(opts.viewerUserId);
  const rows = await db
    .select({
      id: postsComments.id,
      postId: postsComments.postId,
      parentCommentId: postsComments.parentCommentId,
      authorId: postsComments.authorId,
      body: postsComments.body,
      editedAt: postsComments.editedAt,
      createdAt: postsComments.createdAt,
      authorUsername: userProfiles.username,
      authorFirstName: userProfiles.firstName,
      authorLastName: userProfiles.lastName,
      authorAvatarUrl: userProfiles.avatarUrl,
      authorHeadline: userProfiles.headline,
      reactionsLike:      postsComments.reactionsLike,
      reactionsBullish:   postsComments.reactionsBullish,
      reactionsBearish:   postsComments.reactionsBearish,
      reactionsToTheMoon: postsComments.reactionsToTheMoon,
      reactionsDump:      postsComments.reactionsDump,
      viewerReactions:    viewerReactionsForCommentSql(opts.viewerUserId),
    })
    .from(postsComments)
    .leftJoin(userProfiles, eq(userProfiles.userId, postsComments.authorId))
    .where(
      and(
        eq(postsComments.parentCommentId, opts.parentCommentId),
        isNull(postsComments.deletedAt),
        viewerNotBlockedOnComments(opts.viewerUserId),
        cursorClauseCommentsDesc(cursor),
      ),
    )
    .orderBy(desc(postsComments.createdAt), desc(postsComments.id))
    .limit(pageSize + 1);

  const truncated = rows.length > pageSize ? rows.slice(0, pageSize) : rows;
  const replies = truncated.map((r) => rowToCommentCardData(r, hasViewer));

  const nextCursor =
    rows.length > pageSize
      ? encodeCursor(cursorFromRow(truncated[truncated.length - 1]))
      : null;

  return { replies, nextCursor };
}

/**
 * @deprecated Mantenuto per backward-compat. Nuovo codice deve usare
 * `getRootCommentsForPost` + `getInitialRepliesForRoots` per evitare di
 * tirare giù tutto il thread in piano e fare il pull di reply che
 * potrebbero non essere mai mostrate.
 */
export async function getCommentsForPost(opts: {
  postId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<CommentsPage> {
  const root = await getRootCommentsForPost(opts);
  // Per non rompere chiamanti vecchi che si aspettavano flat list, fondiamo
  // root + replies in un solo array. Internamente sconsigliato.
  return { comments: root.comments, nextCursor: root.nextCursor };
}

// ─────────────────────────────────────────────────────────────────────────
// Moderation queue (admin only — gating sul caller)
// ─────────────────────────────────────────────────────────────────────────

export type ReportQueueStatus =
  | "open"
  | "reviewed"
  | "dismissed"
  | "actioned"
  | "all";

/**
 * Status aggregato di un gruppo (tutte le segnalazioni dello stesso
 * post). Calcolato server-side dai conteggi:
 *   - open      → almeno una open
 *   - actioned  → 0 open, almeno una actioned
 *   - dismissed → 0 open, 0 actioned, almeno una dismissed
 *   - reviewed  → tutto il resto (solo reviewed)
 */
export type ReportQueueAggregateStatus =
  | "open"
  | "reviewed"
  | "dismissed"
  | "actioned";

export type ReportQueueGroupRow = {
  post: {
    id: string;
    authorId: string;
    body: string;
    deletedAt: Date | null;
    createdAt: Date;
    author: {
      username: string | null;
      avatarUrl: string | null;
    };
  };
  firstReportedAt: Date;
  lastReportedAt: Date;
  totalReports: number;
  openCount: number;
  reviewedCount: number;
  dismissedCount: number;
  actionedCount: number;
  aggregateStatus: ReportQueueAggregateStatus;
  /** Mappa reason key → count (es. { spam: 5, scam: 2 }). */
  reasonsBreakdown: Record<string, number>;
  /** Avatar/username dei reporter più recenti (max 5, distinti). */
  recentReporters: Array<{
    id: string;
    username: string | null;
    avatarUrl: string | null;
  }>;
};

export type ReportsQueuePage = {
  rows: ReportQueueGroupRow[];
  nextCursor: string | null;
  countByStatus: Record<Exclude<ReportQueueStatus, "all">, number>;
};

/**
 * Lista paginata della moderation queue, **raggruppata per post**.
 * Ogni riga rappresenta un post segnalato (1+ segnalazioni). I conteggi
 * per status + reason breakdown + top reporter sono pre-calcolati così
 * la modale di review può mostrare il quadro completo senza una query
 * extra per ogni click.
 *
 * Cursor keyset su (last_reported_at DESC, post_id DESC).
 *
 * Tre query (batched per gli aggregati delle pages):
 *  1. GROUP BY post_id su posts_reports con FILTER per status counts +
 *     JOIN posts + author per il rendering.
 *  2. reason breakdown via GROUP BY (post_id, reason).
 *  3. recent reporters via SELECT + sort in JS (volume basso per page).
 */
export async function getReportsQueue(opts: {
  status: ReportQueueStatus;
  cursor?: string;
  limit?: number;
}): Promise<ReportsQueuePage> {
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const authorUserProfiles = alias(userProfiles, "author_profile");

  // Status filter sull'aggregato del gruppo (vedi ReportQueueAggregateStatus).
  const havingClause = (() => {
    switch (opts.status) {
      case "all":
        return undefined;
      case "open":
        return sql`COUNT(*) FILTER (WHERE ${postsReports.status} = 'open') > 0`;
      case "actioned":
        return sql`COUNT(*) FILTER (WHERE ${postsReports.status} = 'open') = 0
                   AND COUNT(*) FILTER (WHERE ${postsReports.status} = 'actioned') > 0`;
      case "dismissed":
        return sql`COUNT(*) FILTER (WHERE ${postsReports.status} = 'open') = 0
                   AND COUNT(*) FILTER (WHERE ${postsReports.status} = 'actioned') = 0
                   AND COUNT(*) FILTER (WHERE ${postsReports.status} = 'dismissed') > 0`;
      case "reviewed":
        return sql`COUNT(*) FILTER (WHERE ${postsReports.status} IN ('open','actioned','dismissed')) = 0
                   AND COUNT(*) FILTER (WHERE ${postsReports.status} = 'reviewed') > 0`;
    }
  })();

  // Cursor keyset su MAX(created_at) e post_id.
  const cursorClause = (() => {
    if (!opts.cursor) return undefined;
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) return undefined;
    const at = new Date(decoded.ms).toISOString();
    return sql`(
      MAX(${postsReports.createdAt}) < ${at}
      OR (MAX(${postsReports.createdAt}) = ${at} AND ${postsReports.postId} < ${decoded.id})
    )`;
  })();

  const havingCombined =
    havingClause && cursorClause
      ? sql`${havingClause} AND ${cursorClause}`
      : (havingClause ?? cursorClause);

  // Query 1: gruppi paginati con counts + JOIN posts/author.
  const groupsQuery = db
    .select({
      postId: postsReports.postId,
      firstAt: sql<Date>`MIN(${postsReports.createdAt})`.as("first_at"),
      lastAt: sql<Date>`MAX(${postsReports.createdAt})`.as("last_at"),
      total: sql<number>`COUNT(*)::int`.as("total"),
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'open')::int`.as("open_count"),
      reviewedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'reviewed')::int`.as("reviewed_count"),
      dismissedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'dismissed')::int`.as("dismissed_count"),
      actionedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'actioned')::int`.as("actioned_count"),
      postAuthorId: posts.authorId,
      postBody: posts.body,
      postDeletedAt: posts.deletedAt,
      postCreatedAt: posts.createdAt,
      authorUsername: authorUserProfiles.username,
      authorAvatarUrl: authorUserProfiles.avatarUrl,
    })
    .from(postsReports)
    .innerJoin(posts, eq(posts.id, postsReports.postId))
    .leftJoin(
      authorUserProfiles,
      eq(authorUserProfiles.userId, posts.authorId),
    )
    .groupBy(
      postsReports.postId,
      posts.authorId,
      posts.body,
      posts.deletedAt,
      posts.createdAt,
      authorUserProfiles.username,
      authorUserProfiles.avatarUrl,
    );

  const rawGroups = await (
    havingCombined ? groupsQuery.having(havingCombined) : groupsQuery
  )
    .orderBy(sql`MAX(${postsReports.createdAt}) DESC`, desc(postsReports.postId))
    .limit(limit + 1);

  const hasMore = rawGroups.length > limit;
  const sliced = hasMore ? rawGroups.slice(0, limit) : rawGroups;
  // postId è nullable a schema (M_posts_010 polimorfismo XOR), ma in
  // QUESTA query è SEMPRE valorizzato perché Query 1 fa INNER JOIN posts
  // → esclude row con postId NULL (i comment reports). Filter narrowing
  // per soddisfare TS.
  const postIds = sliced
    .map((g) => g.postId)
    .filter((id): id is string => id !== null);

  // Query 2: reason breakdown per i post della pagina.
  let reasonsByPost: Map<string, Record<string, number>> = new Map();
  if (postIds.length > 0) {
    const reasonRows = await db
      .select({
        postId: postsReports.postId,
        reason: postsReports.reason,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(postsReports)
      .where(inArray(postsReports.postId, postIds))
      .groupBy(postsReports.postId, postsReports.reason);
    for (const r of reasonRows) {
      if (!r.postId) continue;
      const map = reasonsByPost.get(r.postId) ?? {};
      map[r.reason] = r.n;
      reasonsByPost.set(r.postId, map);
    }
  }

  // Query 3: recent reporters (max 5 distinti) per i post della pagina.
  const reporterAlias = alias(userProfiles, "reporter_profile_q3");
  let recentReportersByPost: Map<
    string,
    Array<{ id: string; username: string | null; avatarUrl: string | null; createdAt: Date }>
  > = new Map();
  if (postIds.length > 0) {
    const reporterRows = await db
      .select({
        postId: postsReports.postId,
        reporterId: postsReports.reporterId,
        createdAt: postsReports.createdAt,
        username: reporterAlias.username,
        avatarUrl: reporterAlias.avatarUrl,
      })
      .from(postsReports)
      .leftJoin(reporterAlias, eq(reporterAlias.userId, postsReports.reporterId))
      .where(inArray(postsReports.postId, postIds))
      .orderBy(desc(postsReports.createdAt));
    for (const r of reporterRows) {
      if (!r.postId) continue; // post reports only (comment reports filtrati a monte)
      const arr = recentReportersByPost.get(r.postId) ?? [];
      // Dedup per reporter_id (un utente che segnala 2 volte conta 1).
      if (arr.some((x) => x.id === r.reporterId)) continue;
      if (arr.length < 5) {
        arr.push({
          id: r.reporterId,
          username: r.username ?? null,
          avatarUrl: r.avatarUrl ?? null,
          createdAt: r.createdAt,
        });
        recentReportersByPost.set(r.postId, arr);
      }
    }
  }

  // Assemble
  // Tutti i `g.postId` sono garantiti non-null dall'INNER JOIN posts a
  // monte; il narrow esplicito a string serve solo a TS dato che dal
  // M_posts_010 (polimorfismo post/comment) la colonna è nullable.
  const rows: ReportQueueGroupRow[] = sliced
    .filter((g): g is typeof g & { postId: string } => g.postId !== null)
    .map((g) => {
      const aggregateStatus: ReportQueueAggregateStatus =
        g.openCount > 0
          ? "open"
          : g.actionedCount > 0
            ? "actioned"
            : g.dismissedCount > 0
              ? "dismissed"
              : "reviewed";

      const reporters = (recentReportersByPost.get(g.postId) ?? []).map(
        (r) => ({
          id: r.id,
          username: r.username,
          avatarUrl: r.avatarUrl,
        }),
      );

      return {
        post: {
          id: g.postId,
          authorId: g.postAuthorId,
          body: g.postBody,
          deletedAt: g.postDeletedAt,
          createdAt: g.postCreatedAt,
          author: {
            username: g.authorUsername ?? null,
            avatarUrl: g.authorAvatarUrl ?? null,
          },
        },
        firstReportedAt: g.firstAt,
        lastReportedAt: g.lastAt,
        totalReports: g.total,
        openCount: g.openCount,
        reviewedCount: g.reviewedCount,
        dismissedCount: g.dismissedCount,
        actionedCount: g.actionedCount,
        aggregateStatus,
        reasonsBreakdown: reasonsByPost.get(g.postId) ?? {},
        recentReporters: reporters,
      };
    });

  const lastSliced = sliced[sliced.length - 1];
  const nextCursor =
    hasMore && lastSliced && lastSliced.postId
      ? encodeCursor({
          ms: new Date(lastSliced.lastAt).getTime(),
          id: lastSliced.postId,
        })
      : null;

  // Counts per pills — DISTINCT post_id per ogni aggregateStatus.
  const [openC, reviewedC, dismissedC, actionedC] = await Promise.all([
    countDistinctPostsByAggregate("open"),
    countDistinctPostsByAggregate("reviewed"),
    countDistinctPostsByAggregate("dismissed"),
    countDistinctPostsByAggregate("actioned"),
  ]);

  return {
    rows,
    nextCursor,
    countByStatus: {
      open: openC,
      reviewed: reviewedC,
      dismissed: dismissedC,
      actioned: actionedC,
    },
  };
}

/**
 * Conteggio di post DISTINCT che ricadono in un dato aggregateStatus.
 * Stessa logica del filter HAVING applicato in getReportsQueue.
 */
async function countDistinctPostsByAggregate(
  status: ReportQueueAggregateStatus,
): Promise<number> {
  const condition = (() => {
    switch (status) {
      case "open":
        return sql`COUNT(*) FILTER (WHERE status = 'open') > 0`;
      case "actioned":
        return sql`COUNT(*) FILTER (WHERE status = 'open') = 0
                   AND COUNT(*) FILTER (WHERE status = 'actioned') > 0`;
      case "dismissed":
        return sql`COUNT(*) FILTER (WHERE status = 'open') = 0
                   AND COUNT(*) FILTER (WHERE status = 'actioned') = 0
                   AND COUNT(*) FILTER (WHERE status = 'dismissed') > 0`;
      case "reviewed":
        return sql`COUNT(*) FILTER (WHERE status IN ('open','actioned','dismissed')) = 0
                   AND COUNT(*) FILTER (WHERE status = 'reviewed') > 0`;
    }
  })();

  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT post_id FROM posts_reports
      GROUP BY post_id
      HAVING ${condition}
    ) sub
  `);
  // postgres-js execute returns { rows? } or array depending on driver.
  // Defensive: support both shapes.
  const row = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows?.[0]) as
    | { n?: number }
    | undefined;
  return row?.n ?? 0;
}

/**
 * Tutte le segnalazioni di un post specifico, ordered by createdAt DESC.
 * Usata dalla modale di review per mostrare il dettaglio aggregato.
 */
export async function getReportsForPost(postId: string): Promise<
  Array<{
    report: PostReport;
    reporter: {
      id: string;
      username: string | null;
      avatarUrl: string | null;
    };
  }>
> {
  const reporterAlias2 = alias(userProfiles, "reporter_profile_detail");
  const rows = await db
    .select({
      id: postsReports.id,
      postId: postsReports.postId,
      commentId: postsReports.commentId,
      reporterId: postsReports.reporterId,
      reason: postsReports.reason,
      details: postsReports.details,
      status: postsReports.status,
      reviewedBy: postsReports.reviewedBy,
      reviewedAt: postsReports.reviewedAt,
      createdAt: postsReports.createdAt,
      reporterUsername: reporterAlias2.username,
      reporterAvatarUrl: reporterAlias2.avatarUrl,
    })
    .from(postsReports)
    .leftJoin(reporterAlias2, eq(reporterAlias2.userId, postsReports.reporterId))
    .where(eq(postsReports.postId, postId))
    .orderBy(desc(postsReports.createdAt));

  return rows.map((r) => ({
    report: {
      id: r.id,
      postId: r.postId,
      commentId: r.commentId,
      reporterId: r.reporterId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    },
    reporter: {
      id: r.reporterId,
      username: r.reporterUsername ?? null,
      avatarUrl: r.reporterAvatarUrl ?? null,
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Deleted posts admin queue (post soft-deleted in grace window)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Origine della cancellazione:
 *   - "author"   → l'autore ha eliminato dal proprio post (delete utente)
 *   - "moderator"→ admin ha eseguito un report action (soft-delete)
 *   - "unknown"  → posts.deleted_by è NULL (righe pre-migration M_posts_006)
 */
export type DeletedByKind = "author" | "moderator" | "unknown";

export type DeletedPostRow = {
  id: string;
  body: string;
  deletedAt: Date;
  createdAt: Date;
  author: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  /** Discriminator + (se applicabile) info del moderatore. Per ripristino
   *  con audit consapevole — il moderatore vede chi/cosa sta rovesciando. */
  deletedBy:
    | { kind: "author" }
    | {
        kind: "moderator";
        moderator: {
          id: string;
          username: string | null;
          firstName: string | null;
          lastName: string | null;
          avatarUrl: string | null;
        } | null; // null se l'account del moderatore è stato cancellato
      }
    | { kind: "unknown" };
  /** True se il post è oltre il grace period (cron non ancora passato).
   *  La UI lo segna come "non più ripristinabile". */
  outOfGrace: boolean;
};

export type DeletedPostsFilter = "all" | "author" | "moderator";

export type DeletedPostsPage = {
  rows: DeletedPostRow[];
  nextCursor: string | null;
};

/**
 * Lista paginata dei post soft-deleted ancora visibili al moderatore.
 * Include sia quelli in grace (ripristinabili) sia quelli oltre grace
 * (in attesa del prossimo passaggio del cron hard-delete). Order:
 * deleted_at DESC, id DESC (keyset cursor).
 *
 * LEFT JOIN su user_profiles via cast text per risolvere il moderatore
 * dall'uuid in `posts.deleted_by`. Il cast `user_profiles.user_id::text`
 * funziona per tutti gli uuid; per 'author' (literal non-uuid) il match
 * fallisce gracefully → moderator = null.
 *
 * Admin-only — gate sul caller (`requireAdminSectionPage`).
 */
export async function getDeletedPostsForAdmin(opts: {
  graceDays: number;
  limit?: number;
  filter?: DeletedPostsFilter;
  cursor?: string;
}): Promise<DeletedPostsPage> {
  const limit = opts.limit ?? 50;
  const filter = opts.filter ?? "all";
  const cutoff = new Date(Date.now() - opts.graceDays * 24 * 60 * 60 * 1000);

  const authorProfile = alias(userProfiles, "author_profile_deleted");
  const moderatorProfile = alias(userProfiles, "moderator_profile_deleted");

  // Filtro: 'author' = delete utente; 'moderator' = qualunque valore ≠ 'author'
  // (uuid) + escludiamo NULL ("unknown" lo trattiamo come 'all' contesto).
  const filterClause = (() => {
    switch (filter) {
      case "author":
        return eq(posts.deletedBy, "author");
      case "moderator":
        return and(
          isNotNull(posts.deletedBy),
          sql`${posts.deletedBy} <> 'author'`,
        );
      default:
        return undefined;
    }
  })();

  // Cursor keyset: (deleted_at DESC, id DESC)
  const cursorClause = (() => {
    if (!opts.cursor) return undefined;
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) return undefined;
    const at = new Date(decoded.ms).toISOString();
    return sql`(
      ${posts.deletedAt} < ${at}
      OR (${posts.deletedAt} = ${at} AND ${posts.id} < ${decoded.id})
    )`;
  })();

  const rawRows = await db
    .select({
      id: posts.id,
      body: posts.body,
      deletedAt: posts.deletedAt,
      deletedBy: posts.deletedBy,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorUsername: authorProfile.username,
      authorFirstName: authorProfile.firstName,
      authorLastName: authorProfile.lastName,
      authorAvatarUrl: authorProfile.avatarUrl,
      modUserId: moderatorProfile.userId,
      modUsername: moderatorProfile.username,
      modFirstName: moderatorProfile.firstName,
      modLastName: moderatorProfile.lastName,
      modAvatarUrl: moderatorProfile.avatarUrl,
    })
    .from(posts)
    .leftJoin(authorProfile, eq(authorProfile.userId, posts.authorId))
    .leftJoin(
      moderatorProfile,
      sql`${moderatorProfile.userId}::text = ${posts.deletedBy}`,
    )
    .where(and(isNotNull(posts.deletedAt), filterClause, cursorClause))
    .orderBy(desc(posts.deletedAt), desc(posts.id))
    .limit(limit + 1);

  const hasMore = rawRows.length > limit;
  const slicedRows = hasMore ? rawRows.slice(0, limit) : rawRows;

  const mappedRows: DeletedPostRow[] = slicedRows.map((r) => {
    const deletedByKind: DeletedByKind =
      r.deletedBy === "author"
        ? "author"
        : r.deletedBy
          ? "moderator"
          : "unknown";

    const deletedBy: DeletedPostRow["deletedBy"] =
      deletedByKind === "author"
        ? { kind: "author" }
        : deletedByKind === "moderator"
          ? {
              kind: "moderator",
              moderator: r.modUserId
                ? {
                    id: r.modUserId,
                    username: r.modUsername,
                    firstName: r.modFirstName,
                    lastName: r.modLastName,
                    avatarUrl: r.modAvatarUrl,
                  }
                : null,
            }
          : { kind: "unknown" };

    return {
      id: r.id,
      body: r.body,
      deletedAt: r.deletedAt!,
      createdAt: r.createdAt,
      author: {
        id: r.authorId,
        username: r.authorUsername,
        firstName: r.authorFirstName,
        lastName: r.authorLastName,
        avatarUrl: r.authorAvatarUrl,
      },
      deletedBy,
      outOfGrace: r.deletedAt! < cutoff,
    };
  });

  const nextCursor =
    hasMore && slicedRows.length > 0
      ? encodeCursor({
          ms: new Date(slicedRows[slicedRows.length - 1].deletedAt!).getTime(),
          id: slicedRows[slicedRows.length - 1].id,
        })
      : null;

  return { rows: mappedRows, nextCursor };
}

// ─────────────────────────────────────────────────────────────────────────
// Trending tickers (Explore page)
// ─────────────────────────────────────────────────────────────────────────

export type TrendingTickerRow = {
  ticker: string;
  postCount: number;
};

/**
 * Top N ticker più menzionati negli ultimi `windowHours` ore.
 * Query separata dal feed (pattern GetStream §8: trending NON è un
 * ranking del feed, è una view a sé). Costo trascurabile:
 * GROUP BY su `posts_tickers` con index `idx_posts_tickers_feed`
 * coperto da `(ticker, created_at)` — index-only scan.
 *
 * Cache lato consumer: il caller wrappa in `unstable_cache` (5min)
 * o `revalidate: 300` per evitare 12+ query/h.
 *
 * Esclusione visibility: il count include TUTTE le visibility
 * (public/members/followers/private). Refinement v2 se i creator
 * "private" inflattono il segnale.
 */
export async function getTrendingTickers(opts: {
  windowHours?: number;
  limit?: number;
}): Promise<TrendingTickerRow[]> {
  const windowHours = opts.windowHours ?? 24;
  const limit = opts.limit ?? 10;
  const cutoff = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const rows = await db
    .select({
      ticker: postsTickers.ticker,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(postsTickers)
    .where(sql`${postsTickers.createdAt} >= ${cutoff}`)
    .groupBy(postsTickers.ticker)
    .orderBy(sql`COUNT(*) DESC`, postsTickers.ticker)
    .limit(limit);

  return rows.map((r) => ({ ticker: r.ticker, postCount: r.n }));
}

// Re-export per i client di queries.ts
export { encodeCursor, decodeCursor } from "./lib/cursor";
