// lib/modules/posts/gdpr-export.ts
//
// GDPR data export hook del modulo posts. Default export = function async
// `(userId) => Promise<PostsGdprPayload>` chiamata dal core export
// (lib/account/gdpr-export.ts) via il registry server-only
// lib/modules/gdpr-export-registry.ts.
//
// Cosa includiamo (art. 15 GDPR — diritto di accesso):
//   - posts          → i suoi post (body, visibility, timestamps, counter)
//   - media          → media allegati ai suoi post
//   - comments       → i suoi commenti (postId di riferimento, niente body
//                      del post host se è di altri)
//   - reactions      → sue reactions su post (postId+kind+ts) e su commenti
//   - bookmarks      → i postId che ha salvato (niente body)
//   - mentions       → 2 sezioni: postId dove HA menzionato altri (post suoi),
//                      e dove È STATO menzionato (postId+createdAt — niente
//                      body del post di terzi)
//   - reports        → i suoi report di abuse (no review notes admin)
//   - blocks         → utenti che HA bloccato (no chi lo ha bloccato — è
//                      dato di terzi, non suo)
//   - preferences    → sue preferenze del modulo
//   - tickers        → ticker sui suoi post (dervati, già implici dai posts)
//
// Cosa NON includiamo: postsCronRuns, postsOutbox (operations), reports.review*
// (dati admin di terzi), linkPreviews (cache globale di metadati URL).
//
// Truncation: cap 10k per ogni lista, flag `truncated:true` su superamento.
import "server-only";

import { db } from "@/lib/db/drizzle";
import {
  posts,
  postsMedia,
  postsComments,
  postsReactions,
  postsCommentReactions,
  postsBookmarks,
  postsReports,
  postsMentions,
  postsUserBlocks,
  postsUserPreferences,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

const LIMIT_PER_SECTION = 10_000;

interface TruncatedList<T> {
  items: T[];
  truncated: boolean;
  limit: number;
}

async function collectList<T>(
  rows: Promise<T[]>,
): Promise<TruncatedList<T>> {
  const all = await rows;
  const truncated = all.length > LIMIT_PER_SECTION;
  return {
    items: truncated ? all.slice(0, LIMIT_PER_SECTION) : all,
    truncated,
    limit: LIMIT_PER_SECTION,
  };
}

export default async function collectPostsGdprData(userId: string) {
  // Tutte le query in parallelo: limit_per_section + 1 per sapere se siamo
  // al cap. Filtri sempre su autore/userId; nessun JOIN con dati di terzi.
  const [
    myPosts,
    myMedia,
    myComments,
    myReactions,
    myCommentReactions,
    myBookmarks,
    myMentionsSent,
    myMentionsReceived,
    myReports,
    myBlocks,
    [myPreferences],
  ] = await Promise.all([
    db
      .select({
        id: posts.id,
        body: posts.body,
        visibility: posts.visibility,
        repostOfId: posts.repostOfId,
        editedAt: posts.editedAt,
        deletedAt: posts.deletedAt,
        createdAt: posts.createdAt,
        reactionsLike: posts.reactionsLike,
        reactionsBullish: posts.reactionsBullish,
        reactionsBearish: posts.reactionsBearish,
        reactionsToTheMoon: posts.reactionsToTheMoon,
        reactionsDump: posts.reactionsDump,
        commentsCount: posts.commentsCount,
        repostsCount: posts.repostsCount,
        bookmarksCount: posts.bookmarksCount,
      })
      .from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        id: postsMedia.id,
        postId: postsMedia.postId,
        fullUrl: postsMedia.fullUrl,
        thumbUrl: postsMedia.thumbUrl,
        mimeType: postsMedia.mimeType,
        width: postsMedia.width,
        height: postsMedia.height,
        sizeBytes: postsMedia.sizeBytes,
        position: postsMedia.position,
        createdAt: postsMedia.createdAt,
      })
      .from(postsMedia)
      .where(eq(postsMedia.authorId, userId))
      .orderBy(desc(postsMedia.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        id: postsComments.id,
        postId: postsComments.postId,
        parentCommentId: postsComments.parentCommentId,
        body: postsComments.body,
        editedAt: postsComments.editedAt,
        deletedAt: postsComments.deletedAt,
        createdAt: postsComments.createdAt,
      })
      .from(postsComments)
      .where(eq(postsComments.authorId, userId))
      .orderBy(desc(postsComments.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        postId: postsReactions.postId,
        reaction: postsReactions.reaction,
        createdAt: postsReactions.createdAt,
      })
      .from(postsReactions)
      .where(eq(postsReactions.userId, userId))
      .orderBy(desc(postsReactions.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        commentId: postsCommentReactions.commentId,
        reaction: postsCommentReactions.reaction,
        createdAt: postsCommentReactions.createdAt,
      })
      .from(postsCommentReactions)
      .where(eq(postsCommentReactions.userId, userId))
      .orderBy(desc(postsCommentReactions.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        postId: postsBookmarks.postId,
        createdAt: postsBookmarks.createdAt,
      })
      .from(postsBookmarks)
      .where(eq(postsBookmarks.userId, userId))
      .orderBy(desc(postsBookmarks.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    // Menzioni "sent": post suoi che menzionano altri utenti.
    db
      .select({
        postId: postsMentions.postId,
        mentionedUserId: postsMentions.mentionedUserId,
        createdAt: postsMentions.createdAt,
      })
      .from(postsMentions)
      .innerJoin(posts, eq(posts.id, postsMentions.postId))
      .where(eq(posts.authorId, userId))
      .orderBy(desc(postsMentions.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    // Menzioni "received": dove qualcuno HA menzionato lui. Includiamo
    // solo postId+createdAt — il body del post host appartiene al suo
    // autore (terzo), non a noi da disclosare.
    db
      .select({
        postId: postsMentions.postId,
        createdAt: postsMentions.createdAt,
      })
      .from(postsMentions)
      .where(eq(postsMentions.mentionedUserId, userId))
      .orderBy(desc(postsMentions.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select({
        id: postsReports.id,
        postId: postsReports.postId,
        commentId: postsReports.commentId,
        reason: postsReports.reason,
        details: postsReports.details,
        status: postsReports.status,
        createdAt: postsReports.createdAt,
        // reviewedBy/reviewedAt NON inclusi: dati operativi admin, non
        // dell'utente reporter (chi ha gestito il report è personal
        // data del moderatore, non del segnalante).
      })
      .from(postsReports)
      .where(eq(postsReports.reporterId, userId))
      .orderBy(desc(postsReports.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    // Blocks "sent": chi LUI ha bloccato. Non includiamo chi ha
    // bloccato lui (è dato di terzi che potrebbe rivelare un'intenzione
    // di evitarlo).
    db
      .select({
        blockedId: postsUserBlocks.blockedId,
        createdAt: postsUserBlocks.createdAt,
      })
      .from(postsUserBlocks)
      .where(eq(postsUserBlocks.blockerId, userId))
      .orderBy(desc(postsUserBlocks.createdAt))
      .limit(LIMIT_PER_SECTION + 1),

    db
      .select()
      .from(postsUserPreferences)
      .where(eq(postsUserPreferences.userId, userId))
      .limit(1),
  ]);

  return {
    posts: await collectList(Promise.resolve(myPosts)),
    media: await collectList(Promise.resolve(myMedia)),
    comments: await collectList(Promise.resolve(myComments)),
    reactions: {
      onPosts: await collectList(Promise.resolve(myReactions)),
      onComments: await collectList(Promise.resolve(myCommentReactions)),
    },
    bookmarks: await collectList(Promise.resolve(myBookmarks)),
    mentions: {
      sent: await collectList(Promise.resolve(myMentionsSent)),
      received: await collectList(Promise.resolve(myMentionsReceived)),
    },
    reports: await collectList(Promise.resolve(myReports)),
    blocks: await collectList(Promise.resolve(myBlocks)),
    preferences: myPreferences ?? null,
  };
}
