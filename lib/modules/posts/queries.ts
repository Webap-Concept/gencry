// lib/modules/posts/queries.ts
//
// Read path del modulo Posts. Pattern: separazione listing (ID-only) vs
// hydration (PostCardData batch). Tutti i feed restituiscono cursor
// keyset su (created_at, id) — niente OFFSET, scala lineare con N posts.
//
// Layer di caching (hookable):
//   - getCachedFeedIds(key, fallback)  → ✅ V2 Upstash KV TTL 60s
//                                        (services/feed-cache.ts, dal 17/05/26)
//   - getCachedPosts(ids,  fallback)   → ❌ V1 pass-through (services/post-cache.ts).
//                                        V2 KV `post:{id}` TTL 5min in roadmap
//                                        ma non urgente: il bottleneck era il
//                                        feed-ids, non l'hydration single.
// Tutte le query feed-ids passano da getCachedFeedIds; nessun call site da
// cercare quando upgraderemo la post hydration cache.
//
// Visibility enforcement: gestita SQL-side. Le query NON ritornano post
// che il viewer non ha diritto di vedere — il filtraggio successivo in
// UI è una difesa in profondità, non la fonte di verità.
import { and, asc, desc, eq, gt, inArray, isNull, isNotNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
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
import {
  getCachedPostHydrationBatch,
  setCachedPostHydrationBatch,
} from "./services/post-cache";
import {
  getBlockedIdsForViewer,
  isBlockedBetween,
  notBlockedBy,
  notBlockedByIds,
} from "./services/blocks";
import { getFollowingSet } from "@/lib/modules/social-graph/queries";
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

// Primo paint dei feed (SSR): più piccolo di DEFAULT_PAGE_SIZE per
// alleggerire il payload RSC iniziale (banda + parsing client + query DB).
// Lo scroll successivo usa LOAD_MORE_PAGE_SIZE=30 (client FeedList), quindi
// 12 post coprono già 2-3 schermate prima che parta l'infinite scroll.
// NB: le code di moderazione admin restano su DEFAULT_PAGE_SIZE (semantica
// diversa: quante segnalazioni per pagina, non payload feed).
const FEED_FIRST_PAGE_SIZE = 12;

// ─────────────────────────────────────────────────────────────────────────
// Helpers — visibility predicates and cursor keyset clause
// ─────────────────────────────────────────────────────────────────────────

/** SQL fragment riusabile: `author_id IN (followingSet)`. Empty / undefined
 *  → undefined (Drizzle skip-a nel where). Estratto come helper locale
 *  per non importare dal modulo social-graph dentro un clause builder
 *  hot path (evita catene di re-export). */
function authorInFollowingSetFragment(
  followingSet: ReadonlySet<string> | undefined,
) {
  if (!followingSet || followingSet.size === 0) return undefined;
  const ids = Array.from(followingSet);
  return sql`${posts.authorId} IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

/**
 * Predicato visibility per il feed "Discover" (e per Ticker/Mentions):
 *   - viewer anonimo → solo `public`
 *   - viewer loggato → `public` + `members` + tutti i PROPRI post +
 *     `followers` di autori che il viewer segue (richiede followingSet).
 *
 * `followingSet`: passato dai caller hot-path che lo pre-caricano via
 * `getFollowingSet` (1 chiamata KV cached). Se omesso, il ramo `followers`
 * viene saltato (post `followers` di altri non visibili — fail-safe).
 */
function discoverVisibilityClause(
  viewerUserId: string | undefined,
  followingSet?: ReadonlySet<string>,
) {
  const allowed: PostVisibility[] = viewerUserId
    ? ["public", "members"]
    : ["public"];
  if (!viewerUserId) return inArray(posts.visibility, allowed);
  const followersBranch = authorInFollowingSetFragment(followingSet);
  return or(
    inArray(posts.visibility, allowed),
    eq(posts.authorId, viewerUserId),
    followersBranch
      ? and(eq(posts.visibility, "followers"), followersBranch)
      : undefined,
  );
}

/**
 * Predicato visibility per profilo utente:
 *   - viewer è l'autore → tutto incluso `private`
 *   - viewer loggato non-autore → `public` + `members` + (`followers`
 *     se viewer segue l'autore — verifica via followingSet)
 *   - viewer anonimo → solo `public`
 */
function profileVisibilityClause(
  authorId: string,
  viewerUserId: string | undefined,
  followingSet?: ReadonlySet<string>,
) {
  if (viewerUserId && viewerUserId === authorId) {
    return undefined; // tutto
  }
  const allowed: PostVisibility[] = viewerUserId
    ? ["public", "members"]
    : ["public"];
  // Se il viewer segue l'autore → ammetti anche 'followers'.
  if (viewerUserId && followingSet?.has(authorId)) {
    allowed.push("followers");
  }
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
 *
 * Usato dai caller che NON pre-caricano il Set (commenti, polling, hub).
 * I 5 hot path del feed usano `viewerNotBlockedByIdsPrecomputed` con il
 * Set caricato 1 volta per request via `getBlockedIdsForViewer`.
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
 * Variante KV-set: usata dai 5 hot path del feed. Il caller pre-carica
 * il Set degli id bloccati 1 volta per request (React.cache dedupa fan-
 * out) e lo passa qui. Empty set / anonimo → undefined (no filtro).
 *
 * Vantaggio vs `viewerNotBlockedOnPosts`: 1 fetch KV per request vs N
 * sub-query DB (una per query feed). Stale tollerabile 5min (TTL KV) +
 * 30s (L1 in-process) — block è azione rara.
 */
function viewerNotBlockedByIdsOnPosts(
  blockedIds: ReadonlySet<string> | undefined,
) {
  if (!blockedIds) return undefined;
  return notBlockedByIds(blockedIds, posts.authorId);
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

/**
 * Pagina del feed Discover (/explore, ticker filter). Cronologico globale,
 * niente filtraggio per following. Visibility include `followers` solo se
 * il viewer segue l'autore (gate via followingSet pre-caricato).
 *
 * Per il feed Home (following-first + discovery fill) vedi `getHomeFeedIds`.
 */
export async function getDiscoverFeedIds(opts: {
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);

  const [blockedIds, followingSet] = await Promise.all([
    opts.viewerUserId ? getBlockedIdsForViewer(opts.viewerUserId) : Promise.resolve(undefined),
    opts.viewerUserId ? getFollowingSet(opts.viewerUserId) : Promise.resolve(undefined),
  ]);

  return getCachedFeedIds(
    `discover:${opts.viewerUserId ?? "anon"}:${opts.cursor ?? "0"}:${pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            isNull(posts.deletedAt),
            discoverVisibilityClause(opts.viewerUserId, followingSet),
            viewerNotBlockedByIdsOnPosts(blockedIds),
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(pageSize + 1);
      return toListPage(rows, pageSize);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Home feed — following-first + discovery fill
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cursor composito del Home feed.
 * - mode `following`: stiamo ancora paginando i post di chi il viewer segue.
 *   Il cursor `cur` e' della query following.
 * - mode `discovery`: il following e' esaurito; si pagina solo discovery
 *   (escludendo gli autori gia' inclusi via following).
 *
 * Una volta passati a `discovery` non si torna indietro a `following`:
 * evita riordini/duplicati durante lo scroll.
 */
type HomeCursor =
  | { mode: "following"; cur: string }
  | { mode: "discovery"; cur: string };

function decodeHomeCursor(raw: string | undefined): HomeCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    ) as HomeCursor;
    if (parsed.mode !== "following" && parsed.mode !== "discovery") return null;
    if (typeof parsed.cur !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeHomeCursor(c: HomeCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64");
}

/**
 * Pagina del feed Home. Strategia:
 *
 *   1. viewer anonimo → cade su Discover (non dovrebbe accadere, ma
 *      difesa in profondità).
 *   2. followingSet vuoto → fallback Discover (UI mostrera' anche un
 *      banner "build your feed" sopra). Il feed NON e' mai vuoto.
 *   3. mode === "discovery" → continua solo discovery, escludendo
 *      gli autori gia' inclusi via following.
 *   4. default ("following" o null) → query following keyset; se la
 *      pagina non si riempie, fill con discovery dall'alto.
 */
export async function getHomeFeedIds(opts: {
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
  const parsed = decodeHomeCursor(opts.cursor);

  if (!opts.viewerUserId) {
    return getDiscoverFeedIds({ cursor: parsed?.cur, pageSize });
  }
  const viewerUserId = opts.viewerUserId;

  const [blockedIds, followingSet] = await Promise.all([
    getBlockedIdsForViewer(viewerUserId),
    getFollowingSet(viewerUserId),
  ]);

  if (followingSet.size === 0) {
    return getDiscoverFeedIds({
      viewerUserId,
      cursor: parsed?.cur,
      pageSize,
    });
  }

  if (parsed?.mode === "discovery") {
    return discoveryFillPage({
      viewerUserId,
      excludeAuthorIds: followingSet,
      blockedIds,
      followingSet,
      cursor: parsed.cur,
      pageSize,
    });
  }

  // Following-first
  const followingCur = parsed?.mode === "following" ? parsed.cur : undefined;
  const followingPage = await followingFeedPage({
    viewerUserId,
    followingSet,
    blockedIds,
    cursor: followingCur,
    pageSize,
  });

  if (followingPage.ids.length >= pageSize || followingPage.nextCursor) {
    return {
      ids: followingPage.ids,
      nextCursor: followingPage.nextCursor
        ? encodeHomeCursor({ mode: "following", cur: followingPage.nextCursor })
        : null,
    };
  }

  // Following esaurito nella prima pagina → fill con discovery dall'alto.
  const fillNeeded = pageSize - followingPage.ids.length;
  if (fillNeeded <= 0) {
    return { ids: followingPage.ids, nextCursor: null };
  }
  const discoveryFill = await discoveryFillPage({
    viewerUserId,
    excludeAuthorIds: followingSet,
    blockedIds,
    followingSet,
    cursor: undefined,
    pageSize: fillNeeded,
  });

  const combinedIds = [...followingPage.ids, ...discoveryFill.ids];
  return {
    ids: combinedIds,
    nextCursor: discoveryFill.nextCursor
      ? encodeHomeCursor({ mode: "discovery", cur: discoveryFill.nextCursor })
      : null,
  };
}

async function followingFeedPage(opts: {
  viewerUserId: string;
  followingSet: ReadonlySet<string>;
  blockedIds: ReadonlySet<string> | undefined;
  cursor: string | undefined;
  pageSize: number;
}): Promise<PostListPage> {
  const cursor = decodeCursor(opts.cursor);
  const followingClause = authorInFollowingSetFragment(opts.followingSet);
  // followingSet has size > 0 per garanzia del caller — followingClause
  // non sara' undefined.
  return getCachedFeedIds(
    `home-following:${opts.viewerUserId}:${opts.cursor ?? "0"}:${opts.pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            isNull(posts.deletedAt),
            followingClause,
            // Visibility: autori sono tutti seguiti → ammettiamo public,
            // members, followers. Niente private (l'autore vede i propri
            // private in Discover/profile, non li mostriamo agli altri).
            inArray(posts.visibility, [
              "public",
              "members",
              "followers",
            ] as PostVisibility[]),
            viewerNotBlockedByIdsOnPosts(opts.blockedIds),
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(opts.pageSize + 1);
      return toListPage(rows, opts.pageSize);
    },
  );
}

async function discoveryFillPage(opts: {
  viewerUserId: string;
  excludeAuthorIds: ReadonlySet<string>;
  blockedIds: ReadonlySet<string> | undefined;
  followingSet: ReadonlySet<string>;
  cursor: string | undefined;
  pageSize: number;
}): Promise<PostListPage> {
  const cursor = decodeCursor(opts.cursor);
  const excludeIds = Array.from(opts.excludeAuthorIds);
  const excludeClause =
    excludeIds.length === 0
      ? undefined
      : sql`${posts.authorId} NOT IN (${sql.join(
          excludeIds.map((id) => sql`${id}`),
          sql`, `,
        )})`;

  return getCachedFeedIds(
    `home-discovery:${opts.viewerUserId}:${opts.cursor ?? "0"}:${opts.pageSize}`,
    async () => {
      const rows = await db
        .select({ id: posts.id, createdAt: posts.createdAt })
        .from(posts)
        .where(
          and(
            isNull(posts.deletedAt),
            discoverVisibilityClause(opts.viewerUserId, opts.followingSet),
            excludeClause,
            viewerNotBlockedByIdsOnPosts(opts.blockedIds),
            cursorClause(cursor),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(opts.pageSize + 1);
      return toListPage(rows, opts.pageSize);
    },
  );
}

export async function getProfileFeedIds(opts: {
  authorId: string;
  viewerUserId?: string;
  cursor?: string;
  pageSize?: number;
}): Promise<PostListPage> {
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  const [blockedIds, followingSet] = await Promise.all([
    opts.viewerUserId ? getBlockedIdsForViewer(opts.viewerUserId) : Promise.resolve(undefined),
    opts.viewerUserId ? getFollowingSet(opts.viewerUserId) : Promise.resolve(undefined),
  ]);
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
            profileVisibilityClause(opts.authorId, opts.viewerUserId, followingSet),
            viewerNotBlockedByIdsOnPosts(blockedIds),
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
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  // Ticker normalizzato uppercase (CHECK SQL li impone così).
  const tickerNorm = opts.ticker.toUpperCase();
  const [blockedIds, followingSet] = await Promise.all([
    opts.viewerUserId ? getBlockedIdsForViewer(opts.viewerUserId) : Promise.resolve(undefined),
    opts.viewerUserId ? getFollowingSet(opts.viewerUserId) : Promise.resolve(undefined),
  ]);
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
            discoverVisibilityClause(opts.viewerUserId, followingSet),
            viewerNotBlockedByIdsOnPosts(blockedIds),
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
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
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
  const pageSize = opts.pageSize ?? FEED_FIRST_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  const [blockedIds, followingSet] = await Promise.all([
    opts.viewerUserId ? getBlockedIdsForViewer(opts.viewerUserId) : Promise.resolve(undefined),
    opts.viewerUserId ? getFollowingSet(opts.viewerUserId) : Promise.resolve(undefined),
  ]);
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
            discoverVisibilityClause(opts.viewerUserId, followingSet),
            viewerNotBlockedByIdsOnPosts(blockedIds),
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
  commentsDisabled: boolean;
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
    commentsDisabled: row.commentsDisabled,
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
/**
 * Variante viewer-agnostic di `selectPostsCore`. Restituisce TUTTI i
 * post non-deleted in `ids`, senza filtri block / visibility. È la
 * forma cacheable (post-cache V2): il filtro block + visibility viene
 * applicato lato JS dal caller (`getPostsByIds`) dopo cache lookup.
 *
 * Perché viewer-agnostic: la cache deve essere riutilizzabile cross-
 * viewer. Se applicassimo block o visibility in SQL durante il
 * populate, il payload cachato sarebbe specifico per un solo viewer
 * e l'hit rate crollerebbe.
 */
async function selectPostsCoreCacheable(
  ids: string[],
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
      commentsDisabled: posts.commentsDisabled,
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
    .where(and(inArray(posts.id, ids), isNull(posts.deletedAt)));
  return rows;
}

async function selectPostsCore(
  ids: string[],
  viewerUserId?: string,
  opts: {
    enforceVisibility?: boolean;
    /** Set precomputato dei block per il viewer. Quando presente,
     *  evita la sub-query NOT EXISTS e usa NOT IN sul Set. Opzionale —
     *  i caller non-feed (single post by slug) possono ometterlo. */
    blockedIds?: ReadonlySet<string>;
    /** Set precomputato dei seguiti del viewer. Quando presente, abilita
     *  la visibility `followers` per autori in questo set. */
    followingSet?: ReadonlySet<string>;
  } = {},
): Promise<RawPostRow[]> {
  if (ids.length === 0) return [];
  // Se il caller ha pre-caricato il Set lo usiamo (1 KV fetch ammortizzato
  // su tutte le query del request). Altrimenti fallback a sub-query SQL.
  const blockClause = opts.blockedIds
    ? viewerNotBlockedByIdsOnPosts(opts.blockedIds)
    : viewerNotBlockedOnPosts(viewerUserId);
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
      commentsDisabled: posts.commentsDisabled,
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
        blockClause,
        opts.enforceVisibility
          ? viewerCanSeeVisibility(viewerUserId, opts.followingSet)
          : undefined,
      ),
    );
  return rows;
}

// Filtro visibility per un viewer. Restituisce condizione SQL che
// passa solo per le righe che il viewer può vedere. Usato per embed
// target del quote repost (NON per i feed: lì gestisce getHomeFeedIds /
// getDiscoverFeedIds).
//
// `followingSet`: opzionale, set degli autori seguiti dal viewer. Quando
// presente, ammette anche post `followers` di autori in followingSet.
// Quando assente, `followers` cade su gate viewer==author.
function viewerCanSeeVisibility(
  viewerUserId: string | undefined,
  followingSet?: ReadonlySet<string>,
) {
  if (!viewerUserId) {
    // Viewer anonimo: solo public.
    return eq(posts.visibility, "public");
  }
  const followersBranch = authorInFollowingSetFragment(followingSet);
  // Viewer loggato: public + members sempre; followers se viewer segue
  // l'autore (o se autore == viewer); private solo se viewer == author.
  return or(
    inArray(posts.visibility, ["public", "members"]),
    eq(posts.authorId, viewerUserId),
    followersBranch
      ? and(eq(posts.visibility, "followers"), followersBranch)
      : undefined,
  );
}

// Specchio JS del filtro SQL `viewerCanSeeVisibility`. Usato post-query
// per classificare un target embed mancante come 'not_visible' vs
// 'deleted'. Devono restare allineati (modificarli insieme).
function viewerCanSeeVisibilityJS(
  visibility: string,
  authorId: string,
  viewerUserId: string | undefined,
  followingSet?: ReadonlySet<string>,
): boolean {
  if (visibility === "public") return true;
  if (!viewerUserId) return false;
  if (visibility === "members") return true;
  if (visibility === "followers") {
    return authorId === viewerUserId || (followingSet?.has(authorId) ?? false);
  }
  // private: solo se viewer == author
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
/**
 * Forma del payload cachato (post-cache V2): RawPostRow + media + tickers.
 * Viewer-agnostic. Le Date dopo JSON round-trip sono `string`: il revive
 * a `Date` è in `revivePostHydration`.
 */
type CachedPostHydration = Omit<RawPostRow, "editedAt" | "createdAt" | "deletedAt"> & {
  editedAt: Date | string | null;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  media: PostMediaPublic[];
  tickers: string[];
};

function revivePostHydration(item: CachedPostHydration): {
  raw: RawPostRow;
  media: PostMediaPublic[];
  tickers: string[];
} {
  const raw: RawPostRow = {
    id: item.id,
    authorId: item.authorId,
    body: item.body,
    visibility: item.visibility,
    repostOfId: item.repostOfId,
    editedAt: item.editedAt ? new Date(item.editedAt) : null,
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
    createdAt: new Date(item.createdAt),
    reactionsLike: item.reactionsLike,
    reactionsBullish: item.reactionsBullish,
    reactionsBearish: item.reactionsBearish,
    reactionsToTheMoon: item.reactionsToTheMoon,
    reactionsDump: item.reactionsDump,
    commentsCount: item.commentsCount,
    commentsDisabled: item.commentsDisabled,
    repostsCount: item.repostsCount,
    bookmarksCount: item.bookmarksCount,
    authorUsername: item.authorUsername,
    authorFirstName: item.authorFirstName,
    authorLastName: item.authorLastName,
    authorAvatarUrl: item.authorAvatarUrl,
    authorHeadline: item.authorHeadline,
  };
  return { raw, media: item.media, tickers: item.tickers };
}

/**
 * Hydrata batch da DB (per i cache miss) + write-through al cache.
 * Viewer-agnostic — il caller applica block/visibility dopo.
 */
async function hydrateMissingFromDb(missingIds: string[]): Promise<{
  raws: RawPostRow[];
  mediaMap: Map<string, PostMediaPublic[]>;
  tickerMap: Map<string, string[]>;
}> {
  if (missingIds.length === 0) {
    return { raws: [], mediaMap: new Map(), tickerMap: new Map() };
  }
  const raws = await selectPostsCoreCacheable(missingIds);
  if (raws.length === 0) {
    return { raws: [], mediaMap: new Map(), tickerMap: new Map() };
  }
  const presentIds = raws.map((r) => r.id);
  const [mediaMap, tickerMap] = await Promise.all([
    selectMediaForPosts(presentIds),
    selectTickersForPosts(presentIds),
  ]);
  // Write-through batched. Solo i raw effettivamente non-deleted vengono
  // cachati: i deleted non escono mai da selectPostsCoreCacheable.
  const cachePayload: CachedPostHydration[] = raws.map((raw) => ({
    ...raw,
    media: mediaMap.get(raw.id) ?? [],
    tickers: tickerMap.get(raw.id) ?? [],
  }));
  await setCachedPostHydrationBatch(cachePayload);
  return { raws, mediaMap, tickerMap };
}

export async function getPostsByIds(
  ids: string[],
  opts: { viewerUserId?: string } = {},
): Promise<PostCardData[]> {
  if (ids.length === 0) return [];

  // Pre-carica il Set dei block e dei following 1 volta per request
  // (React.cache dedupa se altri caller del request li invocano:
  //  getHomeFeedIds, getDiscoverFeedIds, getProfileFeedIds + hydration).
  const [blockedIds, followingSet] = await Promise.all([
    opts.viewerUserId ? getBlockedIdsForViewer(opts.viewerUserId) : Promise.resolve(undefined),
    opts.viewerUserId ? getFollowingSet(opts.viewerUserId) : Promise.resolve(undefined),
  ]);

  // ── Phase A: main posts ────────────────────────────────────────────────
  // Cache hit/miss split per gli ids richiesti.
  const aBatch = await getCachedPostHydrationBatch<CachedPostHydration>(ids);

  // Hydrate i miss dal DB + write-through cache.
  const aFreshHydration = await hydrateMissingFromDb(aBatch.missing);

  // Indice unico id → { raw, media, tickers } combinando hit (revived) + fresh.
  const coreById = new Map<
    string,
    { raw: RawPostRow; media: PostMediaPublic[]; tickers: string[] }
  >();
  for (const [id, cached] of aBatch.hits) {
    coreById.set(id, revivePostHydration(cached));
  }
  for (const raw of aFreshHydration.raws) {
    coreById.set(raw.id, {
      raw,
      media: aFreshHydration.mediaMap.get(raw.id) ?? [],
      tickers: aFreshHydration.tickerMap.get(raw.id) ?? [],
    });
  }

  // Filtro block: se viewer e autore hanno relazione di block, droppa
  // il post (UX equivalente a 'deleted', nessun leak della relazione).
  if (blockedIds && blockedIds.size > 0) {
    for (const [id, entry] of coreById) {
      if (blockedIds.has(entry.raw.authorId)) coreById.delete(id);
    }
  }

  if (coreById.size === 0) return [];

  // ── Phase B: repost targets (depth 1) ──────────────────────────────────
  // Stesso pattern hit/miss. enforceVisibility per i target è applicato
  // JS post-cache (vedi viewerCanSeeVisibilityJS).
  const repostTargetIds = Array.from(
    new Set(
      Array.from(coreById.values())
        .filter((p) => p.raw.repostOfId)
        .map((p) => p.raw.repostOfId!),
    ),
  );

  const targetById = new Map<
    string,
    { raw: RawPostRow; media: PostMediaPublic[]; tickers: string[] }
  >();
  // missingTargetMeta = id non visibili (visibility-gated o block-filtered)
  // per la classificazione del tombstone reason.
  const missingTargetMeta = new Map<
    string,
    { visibility: string; authorId: string; deletedAt: Date | null }
  >();

  if (repostTargetIds.length > 0) {
    const bBatch = await getCachedPostHydrationBatch<CachedPostHydration>(repostTargetIds);
    const bFresh = await hydrateMissingFromDb(bBatch.missing);

    const allTargetEntries = new Map<
      string,
      { raw: RawPostRow; media: PostMediaPublic[]; tickers: string[] }
    >();
    for (const [id, cached] of bBatch.hits) {
      allTargetEntries.set(id, revivePostHydration(cached));
    }
    for (const raw of bFresh.raws) {
      allTargetEntries.set(raw.id, {
        raw,
        media: bFresh.mediaMap.get(raw.id) ?? [],
        tickers: bFresh.tickerMap.get(raw.id) ?? [],
      });
    }

    // Applica block + visibility ai target. Block-filtered cade su
    // tombstone reason 'deleted' per non leakare la relazione.
    for (const id of repostTargetIds) {
      const entry = allTargetEntries.get(id);
      if (!entry) continue;
      const blocked = blockedIds?.has(entry.raw.authorId) ?? false;
      const canSee = viewerCanSeeVisibilityJS(
        entry.raw.visibility,
        entry.raw.authorId,
        opts.viewerUserId,
        followingSet,
      );
      if (blocked || !canSee) {
        // Salviamo i meta per classificare il tombstone. Block-filtered
        // → tombstone 'deleted'. Visibility-gated → 'not_visible'.
        missingTargetMeta.set(id, {
          visibility: entry.raw.visibility,
          authorId: entry.raw.authorId,
          deletedAt: blocked ? new Date(0) : null, // sentinel: blocked→'deleted'
        });
      } else {
        targetById.set(id, entry);
      }
    }

    // Per i target completamente assenti (hard-deleted o id-mai-esistito),
    // query light per distinguere 'deleted' vs id-typo (entrambi → 'deleted').
    const fullyMissing = repostTargetIds.filter(
      (id) => !targetById.has(id) && !missingTargetMeta.has(id),
    );
    if (fullyMissing.length > 0) {
      const lightRows = await db
        .select({
          id: posts.id,
          visibility: posts.visibility,
          authorId: posts.authorId,
          deletedAt: posts.deletedAt,
        })
        .from(posts)
        .where(inArray(posts.id, fullyMissing));
      for (const r of lightRows) {
        missingTargetMeta.set(r.id, {
          visibility: r.visibility,
          authorId: r.authorId,
          deletedAt: r.deletedAt,
        });
      }
    }
  }

  // ── Phase C: viewer state (DB, per-utente) ─────────────────────────────
  const allPostIds = [
    ...Array.from(coreById.keys()),
    ...Array.from(targetById.keys()),
  ];
  const viewerMap = opts.viewerUserId
    ? await selectViewerStateForPosts(allPostIds, opts.viewerUserId)
    : new Map<string, PostViewerState>();

  // ── Phase D: assemble ──────────────────────────────────────────────────
  const assemble = (entry: {
    raw: RawPostRow;
    media: PostMediaPublic[];
    tickers: string[];
  }): PostCardData => {
    const { raw, media, tickers } = entry;
    const coreCard = rowToCardCore(raw);
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
      tickers,
      media,
      viewer: opts.viewerUserId
        ? viewerMap.get(raw.id) ?? { ownReactions: [], bookmarked: false }
        : null,
      commentsDisabled: coreCard.commentsDisabled,
    };
    if (raw.repostOfId) {
      const target = targetById.get(raw.repostOfId);
      if (target) {
        const targetCore = rowToCardCore(target.raw);
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
          tickers: target.tickers,
          media: target.media,
          viewer: opts.viewerUserId
            ? viewerMap.get(target.raw.id) ?? { ownReactions: [], bookmarked: false }
            : null,
          commentsDisabled: targetCore.commentsDisabled,
        };
      } else {
        // Distinguo 'deleted' vs 'not_visible' via missingTargetMeta.
        // Block-filtered → 'deleted' (no leak).
        const meta = missingTargetMeta.get(raw.repostOfId);
        const reason: "deleted" | "not_visible" =
          meta &&
          !meta.deletedAt &&
          !viewerCanSeeVisibilityJS(
            meta.visibility,
            meta.authorId,
            opts.viewerUserId,
            followingSet,
          )
            ? "not_visible"
            : "deleted";
        card.repostOfTombstone = { id: raw.repostOfId, reason };
      }
    }
    return card;
  };

  // Preserva ordine ids; filtra missing (deleted/block/non-existent).
  return ids.flatMap((id) => {
    const entry = coreById.get(id);
    return entry ? [assemble(entry)] : [];
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

/**
 * Wrapper cache-friendly di `getPostBySlug` USATO SOLO da `generateMetadata`
 * della post page (SEO + OG/Twitter card).
 *
 * Sicurezza: chiamato SENZA viewerUserId → la visibility-gate interna nega
 * private/followers (ritorna null) e la metadata cade sul fallback
 * "Post" + noindex. Per i post public, la PostCardData ritornata è
 * deterministicamente identica per chiunque (no viewer state nel render
 * di OG image/title/description) → cacheable globalmente.
 *
 * Cache: 5 min + tag `post:{id}`. Invalidato dalle 3 Server Action che
 * cambiano body/author/visibility/media:
 *   - editPost, softDeletePost, restorePost
 * Le mutation viewer-specific (toggleReaction/bookmark) NON invalidano —
 * non cambiano i campi usati dal metadata.
 *
 * Hot path: ogni share Slack/Twitter, ogni crawler GoogleBot/Bingbot,
 * ogni hit di preview link. Prima: 1 query DB ad ogni hit. Ora: 1 query
 * ogni 5min per post hot, fan-out su crawler bot innocuo.
 */
export async function getCachedPostBySlugForMetadata(
  postId: string,
): Promise<PostCardData | null> {
  if (!UUID_REGEX.test(postId)) return null;
  const cached = unstable_cache(
    () => getPostBySlug(postId),
    ["post-metadata", postId],
    { revalidate: 300, tags: [`post:${postId}`] },
  );
  try {
    return await cached();
  } catch (err) {
    console.warn(
      `[getCachedPostBySlugForMetadata] cache failed for ${postId}, falling back to fresh`,
      err,
    );
    return await getPostBySlug(postId);
  }
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
      WHERE post_id IS NOT NULL
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
// Reports queue — COMMENT variant (specchio di getReportsQueue ma su
// posts_comments). Lo schema posts_reports è polimorfico via XOR
// post_id/comment_id (M_posts_010); il queue admin separa le due
// modalità in tab distinti per chiarezza dell'operatore.
// ─────────────────────────────────────────────────────────────────────────

export type CommentReportQueueGroupRow = {
  comment: {
    id: string;
    postId: string;
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
  reasonsBreakdown: Record<string, number>;
  recentReporters: Array<{
    id: string;
    username: string | null;
    avatarUrl: string | null;
  }>;
};

export type CommentReportsQueuePage = {
  rows: CommentReportQueueGroupRow[];
  nextCursor: string | null;
  countByStatus: Record<Exclude<ReportQueueStatus, "all">, number>;
};

export async function getCommentReportsQueue(opts: {
  status: ReportQueueStatus;
  cursor?: string;
  limit?: number;
}): Promise<CommentReportsQueuePage> {
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const commentAuthorProfiles = alias(userProfiles, "comment_author_profile");

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

  const cursorClause = (() => {
    if (!opts.cursor) return undefined;
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) return undefined;
    const at = new Date(decoded.ms).toISOString();
    return sql`(
      MAX(${postsReports.createdAt}) < ${at}
      OR (MAX(${postsReports.createdAt}) = ${at} AND ${postsReports.commentId} < ${decoded.id})
    )`;
  })();

  const havingCombined =
    havingClause && cursorClause
      ? sql`${havingClause} AND ${cursorClause}`
      : (havingClause ?? cursorClause);

  // Query 1: gruppi paginati con counts + JOIN posts_comments/author.
  const groupsQuery = db
    .select({
      commentId: postsReports.commentId,
      firstAt: sql<Date>`MIN(${postsReports.createdAt})`.as("first_at"),
      lastAt: sql<Date>`MAX(${postsReports.createdAt})`.as("last_at"),
      total: sql<number>`COUNT(*)::int`.as("total"),
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'open')::int`.as("open_count"),
      reviewedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'reviewed')::int`.as("reviewed_count"),
      dismissedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'dismissed')::int`.as("dismissed_count"),
      actionedCount: sql<number>`COUNT(*) FILTER (WHERE ${postsReports.status} = 'actioned')::int`.as("actioned_count"),
      commentPostId: postsComments.postId,
      commentAuthorId: postsComments.authorId,
      commentBody: postsComments.body,
      commentDeletedAt: postsComments.deletedAt,
      commentCreatedAt: postsComments.createdAt,
      authorUsername: commentAuthorProfiles.username,
      authorAvatarUrl: commentAuthorProfiles.avatarUrl,
    })
    .from(postsReports)
    .innerJoin(postsComments, eq(postsComments.id, postsReports.commentId))
    .leftJoin(
      commentAuthorProfiles,
      eq(commentAuthorProfiles.userId, postsComments.authorId),
    )
    .groupBy(
      postsReports.commentId,
      postsComments.postId,
      postsComments.authorId,
      postsComments.body,
      postsComments.deletedAt,
      postsComments.createdAt,
      commentAuthorProfiles.username,
      commentAuthorProfiles.avatarUrl,
    );

  const rawGroups = await (
    havingCombined ? groupsQuery.having(havingCombined) : groupsQuery
  )
    .orderBy(
      sql`MAX(${postsReports.createdAt}) DESC`,
      desc(postsReports.commentId),
    )
    .limit(limit + 1);

  const hasMore = rawGroups.length > limit;
  const sliced = hasMore ? rawGroups.slice(0, limit) : rawGroups;
  // commentId garantito non-null dall'INNER JOIN.
  const commentIds = sliced
    .map((g) => g.commentId)
    .filter((id): id is string => id !== null);

  // Query 2: reason breakdown.
  let reasonsByComment: Map<string, Record<string, number>> = new Map();
  if (commentIds.length > 0) {
    const reasonRows = await db
      .select({
        commentId: postsReports.commentId,
        reason: postsReports.reason,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(postsReports)
      .where(inArray(postsReports.commentId, commentIds))
      .groupBy(postsReports.commentId, postsReports.reason);
    for (const r of reasonRows) {
      if (!r.commentId) continue;
      const map = reasonsByComment.get(r.commentId) ?? {};
      map[r.reason] = r.n;
      reasonsByComment.set(r.commentId, map);
    }
  }

  // Query 3: recent reporters (max 5 distinti).
  const reporterAlias = alias(userProfiles, "reporter_profile_q3_comment");
  let recentReportersByComment: Map<
    string,
    Array<{ id: string; username: string | null; avatarUrl: string | null; createdAt: Date }>
  > = new Map();
  if (commentIds.length > 0) {
    const reporterRows = await db
      .select({
        commentId: postsReports.commentId,
        reporterId: postsReports.reporterId,
        createdAt: postsReports.createdAt,
        username: reporterAlias.username,
        avatarUrl: reporterAlias.avatarUrl,
      })
      .from(postsReports)
      .leftJoin(reporterAlias, eq(reporterAlias.userId, postsReports.reporterId))
      .where(inArray(postsReports.commentId, commentIds))
      .orderBy(desc(postsReports.createdAt));
    for (const r of reporterRows) {
      if (!r.commentId) continue;
      const arr = recentReportersByComment.get(r.commentId) ?? [];
      if (arr.some((x) => x.id === r.reporterId)) continue;
      if (arr.length < 5) {
        arr.push({
          id: r.reporterId,
          username: r.username ?? null,
          avatarUrl: r.avatarUrl ?? null,
          createdAt: r.createdAt,
        });
        recentReportersByComment.set(r.commentId, arr);
      }
    }
  }

  const rows: CommentReportQueueGroupRow[] = sliced
    .filter((g): g is typeof g & { commentId: string } => g.commentId !== null)
    .map((g) => {
      const aggregateStatus: ReportQueueAggregateStatus =
        g.openCount > 0
          ? "open"
          : g.actionedCount > 0
            ? "actioned"
            : g.dismissedCount > 0
              ? "dismissed"
              : "reviewed";

      const reporters = (
        recentReportersByComment.get(g.commentId) ?? []
      ).map((r) => ({
        id: r.id,
        username: r.username,
        avatarUrl: r.avatarUrl,
      }));

      return {
        comment: {
          id: g.commentId,
          postId: g.commentPostId,
          authorId: g.commentAuthorId,
          body: g.commentBody,
          deletedAt: g.commentDeletedAt,
          createdAt: g.commentCreatedAt,
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
        reasonsBreakdown: reasonsByComment.get(g.commentId) ?? {},
        recentReporters: reporters,
      };
    });

  const lastSliced = sliced[sliced.length - 1];
  const nextCursor =
    hasMore && lastSliced && lastSliced.commentId
      ? encodeCursor({
          ms: new Date(lastSliced.lastAt).getTime(),
          id: lastSliced.commentId,
        })
      : null;

  const [openC, reviewedC, dismissedC, actionedC] = await Promise.all([
    countDistinctCommentsByAggregate("open"),
    countDistinctCommentsByAggregate("reviewed"),
    countDistinctCommentsByAggregate("dismissed"),
    countDistinctCommentsByAggregate("actioned"),
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

async function countDistinctCommentsByAggregate(
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
      SELECT comment_id FROM posts_reports
      WHERE comment_id IS NOT NULL
      GROUP BY comment_id
      HAVING ${condition}
    ) sub
  `);
  const row = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows?.[0]) as
    | { n?: number }
    | undefined;
  return row?.n ?? 0;
}

/** Tutte le segnalazioni di UN commento specifico, ordered DESC. */
export async function getReportsForComment(commentId: string): Promise<
  Array<{
    report: PostReport;
    reporter: {
      id: string;
      username: string | null;
      avatarUrl: string | null;
    };
  }>
> {
  const reporterAlias3 = alias(userProfiles, "reporter_profile_comment_detail");
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
      reporterUsername: reporterAlias3.username,
      reporterAvatarUrl: reporterAlias3.avatarUrl,
    })
    .from(postsReports)
    .leftJoin(reporterAlias3, eq(reporterAlias3.userId, postsReports.reporterId))
    .where(eq(postsReports.commentId, commentId))
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
