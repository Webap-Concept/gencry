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
  users,
  userProfiles,
  type PostReactionKind,
  type PostReport,
  type PostVisibility,
} from "@/lib/db/schema";
import { getCachedFeedIds } from "./services/feed-cache";
import { getCachedPosts } from "./services/post-cache";
import { cursorFromRow, decodeCursor, encodeCursor } from "./lib/cursor";
import type {
  CommentCardData,
  CommentsPage,
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

/** Equivalente di cursorClause ma per ASC (commenti). */
function cursorClauseAsc(cursor: ReturnType<typeof decodeCursor>) {
  if (!cursor) return undefined;
  const cursorDate = new Date(cursor.ms);
  return or(
    gt(postsComments.createdAt, cursorDate),
    and(eq(postsComments.createdAt, cursorDate), gt(postsComments.id, cursor.id)),
  );
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
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize).ids;
    },
  ).then((ids) =>
    // Ricostruisce nextCursor dall'ultima riga (cache ritorna solo ids).
    // V2 con KV vorrà serializzare anche nextCursor — per ora ricalcoliamo.
    rebuildPage(ids, pageSize),
  );
}

/** Helper: dato un array di ids già limitato a pageSize+1 (o pageSize),
 *  reflette se c'è nextCursor. Per ora la cache ritorna max pageSize+1
 *  ids; calcoliamo qui da `posts.createdAt`. Round-trip aggiuntivo, ma
 *  in V1 (no cache) `getCachedFeedIds` chiama subito il fallback che
 *  già conosce nextCursor — quindi questa funzione è no-op per ora.
 *  Manteniamo lo skeleton per V2.
 */
async function rebuildPage(ids: string[], pageSize: number): Promise<PostListPage> {
  if (ids.length <= pageSize) {
    return { ids, nextCursor: null };
  }
  const page = ids.slice(0, pageSize);
  // V2: query timestamp del page[last] per costruire il cursor.
  // V1: cache è pass-through e questo branch non viene mai raggiunto.
  const lastRow = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(eq(posts.id, page[page.length - 1]))
    .limit(1);
  if (!lastRow[0]) return { ids: page, nextCursor: null };
  return { ids: page, nextCursor: encodeCursor(cursorFromRow(lastRow[0])) };
}

export async function getProfileFeedIds(opts: {
  authorId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  const rows = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(posts)
    .where(
      and(
        eq(posts.authorId, opts.authorId),
        isNull(posts.deletedAt),
        profileVisibilityClause(opts.authorId, opts.viewerUserId),
        cursorClause(cursor),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(pageSize + 1);
  return toListPage(rows, pageSize);
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
  const rows = await db
    .select({ id: posts.id, createdAt: posts.createdAt })
    .from(postsTickers)
    .innerJoin(posts, eq(posts.id, postsTickers.postId))
    .where(
      and(
        eq(postsTickers.ticker, tickerNorm),
        isNull(posts.deletedAt),
        discoverVisibilityClause(opts.viewerUserId),
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
}

export async function getBookmarkFeedIds(opts: {
  viewerUserId: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
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
  const rows = await db
    .select({ id: posts.id, createdAt: postsMentions.createdAt })
    .from(postsMentions)
    .innerJoin(posts, eq(posts.id, postsMentions.postId))
    .where(
      and(
        eq(postsMentions.mentionedUserId, opts.targetUserId),
        isNull(posts.deletedAt),
        discoverVisibilityClause(opts.viewerUserId),
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
  reactionsRocket: number;
  reactionsBull: number;
  reactionsBear: number;
  reactionsDump: number;
  reactionsDiamond: number;
  commentsCount: number;
  repostsCount: number;
  bookmarksCount: number;
  authorUsername: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorAvatarUrl: string | null;
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
  };
  const counts: PostCounts = {
    reactions: {
      like:    row.reactionsLike,
      rocket:  row.reactionsRocket,
      bull:    row.reactionsBull,
      bear:    row.reactionsBear,
      dump:    row.reactionsDump,
      diamond: row.reactionsDiamond,
    },
    reactionsTotal:
      row.reactionsLike +
      row.reactionsRocket +
      row.reactionsBull +
      row.reactionsBear +
      row.reactionsDump +
      row.reactionsDiamond,
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
 * NB: per il viewerUserId la visibility NON viene riapplicata qui — la
 * fonte di verità è stata getFeedIds(). Se un caller passa direttamente
 * un id che il viewer non ha diritto di vedere, riceve comunque la row
 * (security trade-off: l'enforcement è sul feed listing). Per pagine
 * single-post (getPostBySlug) c'è check visibility esplicito sotto.
 */
async function selectPostsCore(ids: string[]): Promise<RawPostRow[]> {
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
      reactionsLike: posts.reactionsLike,
      reactionsRocket: posts.reactionsRocket,
      reactionsBull: posts.reactionsBull,
      reactionsBear: posts.reactionsBear,
      reactionsDump: posts.reactionsDump,
      reactionsDiamond: posts.reactionsDiamond,
      commentsCount: posts.commentsCount,
      repostsCount: posts.repostsCount,
      bookmarksCount: posts.bookmarksCount,
      authorUsername: userProfiles.username,
      authorFirstName: userProfiles.firstName,
      authorLastName: userProfiles.lastName,
      authorAvatarUrl: userProfiles.avatarUrl,
    })
    .from(posts)
    .leftJoin(userProfiles, eq(userProfiles.userId, posts.authorId))
    .where(and(inArray(posts.id, ids), isNull(posts.deletedAt)));
  return rows;
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
 * resta null e A.repostOfTombstone = { id: B }.
 */
export async function getPostsByIds(
  ids: string[],
  opts: { viewerUserId?: string } = {},
): Promise<PostCardData[]> {
  if (ids.length === 0) return [];

  return getCachedPosts(ids, async (missingIds) => {
    // Step 1: core posts
    const core = await selectPostsCore(missingIds);
    if (core.length === 0) return [];

    // Step 2: repost targets (depth 1)
    const repostTargetIds = Array.from(
      new Set(core.filter((p) => p.repostOfId).map((p) => p.repostOfId!)),
    );
    const targetCore = repostTargetIds.length
      ? await selectPostsCore(repostTargetIds)
      : [];
    const targetCoreById = new Map(targetCore.map((p) => [p.id, p]));

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
          card.repostOfTombstone = { id: row.repostOfId };
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
export async function getPostBySlug(
  postId: string,
  opts: { viewerUserId?: string } = {},
): Promise<PostCardData | null> {
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
// Comments: thread cursor-paginated
// ─────────────────────────────────────────────────────────────────────────

export async function getCommentsForPost(opts: {
  postId: string;
  cursor?: string;
  pageSize?: number;
}): Promise<CommentsPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);

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
    })
    .from(postsComments)
    .leftJoin(userProfiles, eq(userProfiles.userId, postsComments.authorId))
    .where(
      and(
        eq(postsComments.postId, opts.postId),
        isNull(postsComments.deletedAt),
        cursorClauseAsc(cursor),
      ),
    )
    .orderBy(asc(postsComments.createdAt), asc(postsComments.id))
    .limit(pageSize + 1);

  const truncated = rows.length > pageSize ? rows.slice(0, pageSize) : rows;
  const comments: CommentCardData[] = truncated.map((r) => ({
    id: r.id,
    postId: r.postId,
    parentCommentId: r.parentCommentId,
    author: {
      id: r.authorId,
      username: r.authorUsername,
      firstName: r.authorFirstName,
      lastName: r.authorLastName,
      avatarUrl: r.authorAvatarUrl,
    },
    body: r.body,
    editedAt: r.editedAt,
    createdAt: r.createdAt,
  }));

  const nextCursor =
    rows.length > pageSize
      ? encodeCursor(cursorFromRow(truncated[truncated.length - 1]))
      : null;

  return { comments, nextCursor };
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

export type ReportQueueRow = {
  report: PostReport;
  reporter: {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
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
  /** Count totale di report aperti sullo stesso post, per dare contesto
   *  di volume al moderatore ("3 report attivi su questo post"). */
  siblingOpenReports: number;
};

export type ReportsQueuePage = {
  rows: ReportQueueRow[];
  nextCursor: string | null;
  countByStatus: Record<Exclude<ReportQueueStatus, "all">, number>;
};

/**
 * Lista paginata della queue di moderazione. JOIN posts_reports + posts +
 * users (autore post e reporter). Cursor keyset su (created_at, id).
 *
 * countByStatus è calcolato sempre (5 piccoli COUNT in parallelo) per
 * popolare i badge delle pill tabs senza una seconda chiamata client.
 */
export async function getReportsQueue(opts: {
  status: ReportQueueStatus;
  cursor?: string;
  limit?: number;
}): Promise<ReportsQueuePage> {
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const reporterUserProfiles = userProfiles;
  const authorUserProfiles = userProfiles;

  // Alias per JOIN doppio (reporter + author del post)
  const reporterUsers = users;
  const authorUsers = users;

  // Cursor keyset: (created_at DESC, id DESC)
  const cursorClause = (() => {
    if (!opts.cursor) return undefined;
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) return undefined;
    const at = new Date(decoded.ms);
    return or(
      lt(postsReports.createdAt, at),
      and(eq(postsReports.createdAt, at), lt(postsReports.id, decoded.id)),
    );
  })();

  const statusClause =
    opts.status === "all"
      ? undefined
      : eq(postsReports.status, opts.status);

  const rawRows = await db
    .select({
      reportId: postsReports.id,
      reportPostId: postsReports.postId,
      reportReporterId: postsReports.reporterId,
      reportReason: postsReports.reason,
      reportDetails: postsReports.details,
      reportStatus: postsReports.status,
      reportReviewedBy: postsReports.reviewedBy,
      reportReviewedAt: postsReports.reviewedAt,
      reportCreatedAt: postsReports.createdAt,
      reporterUsername: reporterUserProfiles.username,
      reporterAvatarUrl: reporterUserProfiles.avatarUrl,
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
      reporterUserProfiles,
      eq(reporterUserProfiles.userId, postsReports.reporterId),
    )
    .leftJoin(
      authorUserProfiles,
      eq(authorUserProfiles.userId, posts.authorId),
    )
    .where(and(statusClause, cursorClause))
    .orderBy(desc(postsReports.createdAt), desc(postsReports.id))
    .limit(limit + 1);

  const hasMore = rawRows.length > limit;
  const sliced = hasMore ? rawRows.slice(0, limit) : rawRows;

  // Sibling open count batch — un'unica query group by post_id.
  const postIds = sliced.map((r) => r.reportPostId);
  let siblingMap: Map<string, number> = new Map();
  if (postIds.length > 0) {
    const groups = await db
      .select({
        postId: postsReports.postId,
        n: sql<number>`count(*)::int`,
      })
      .from(postsReports)
      .where(
        and(
          inArray(postsReports.postId, postIds),
          eq(postsReports.status, "open"),
        ),
      )
      .groupBy(postsReports.postId);
    siblingMap = new Map(groups.map((g) => [g.postId, g.n]));
  }

  const rows: ReportQueueRow[] = sliced.map((r) => ({
    report: {
      id: r.reportId,
      postId: r.reportPostId,
      reporterId: r.reportReporterId,
      reason: r.reportReason,
      details: r.reportDetails,
      status: r.reportStatus,
      reviewedBy: r.reportReviewedBy,
      reviewedAt: r.reportReviewedAt,
      createdAt: r.reportCreatedAt,
    },
    reporter: {
      id: r.reportReporterId,
      username: r.reporterUsername ?? null,
      avatarUrl: r.reporterAvatarUrl ?? null,
    },
    post: {
      id: r.reportPostId,
      authorId: r.postAuthorId,
      body: r.postBody,
      deletedAt: r.postDeletedAt,
      createdAt: r.postCreatedAt,
      author: {
        username: r.authorUsername ?? null,
        avatarUrl: r.authorAvatarUrl ?? null,
      },
    },
    siblingOpenReports: siblingMap.get(r.reportPostId) ?? 0,
  }));

  const nextCursor =
    hasMore && sliced.length > 0
      ? encodeCursor({
          ms: sliced[sliced.length - 1].reportCreatedAt.getTime(),
          id: sliced[sliced.length - 1].reportId,
        })
      : null;

  // Counts per pills — 4 piccole query batch.
  const [openC, reviewedC, dismissedC, actionedC] = await Promise.all([
    countReportsByStatus("open"),
    countReportsByStatus("reviewed"),
    countReportsByStatus("dismissed"),
    countReportsByStatus("actioned"),
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

async function countReportsByStatus(status: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postsReports)
    .where(eq(postsReports.status, status));
  return row?.n ?? 0;
}

// Re-export per i client di queries.ts
export { encodeCursor, decodeCursor } from "./lib/cursor";
