// lib/modules/posts/types.ts
//
// DTO ricchi che il read path (queries.ts) restituisce a UI e Realtime.
// Separati dalle row Drizzle (`Post`, `PostMedia`, ...) per:
//   - includere campi join (author profile, ticker list, media array)
//   - includere campi viewer-specific (ownReactions, bookmarked)
//   - escludere campi che NON devono lasciare il backend (es. tsvector)
//
// Stabilità: questa è l'interfaccia pubblica del modulo posts. Cambiarla
// significa toccare la UI (PR-5) e Realtime (PR-7). Aggiungere campi
// opzionali è safe; rinominare o eliminare un campo richiede deprecation.
import type { PostReactionKind, PostVisibility } from "@/lib/db/schema";

export type PostAuthorPublic = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  /** Headline (frase breve LinkedIn-style) — mostrata sotto username
   *  nelle card/commenti dove appare l'autore. Truncate UI-side. */
  headline: string | null;
};

export type PostMediaPublic = {
  id: string;
  fullUrl: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  position: number;
};

export type PostReactionCounts = {
  like: number;
  bullish: number;
  bearish: number;
  to_the_moon: number;
  dump: number;
};

export type PostCounts = {
  reactions: PostReactionCounts;
  /** Somma di reactions.* — comoda per la UX "X reactions" senza loop client */
  reactionsTotal: number;
  comments: number;
  reposts: number;
  bookmarks: number;
};

/**
 * Viewer-specific. `null` se la query è stata fatta senza viewerUserId
 * (utente anonimo o RSC public). UI usa questi campi per evidenziare la
 * propria reaction / bookmark; sono volutamente fuori da PostCardData
 * "core" così la cache `post:{id}` (V2) non si invalida per ogni utente.
 */
export type PostViewerState = {
  ownReactions: PostReactionKind[];
  bookmarked: boolean;
};

export type PostCardData = {
  id: string;
  author: PostAuthorPublic;
  body: string;
  visibility: PostVisibility;
  /** Set when this row is a quote repost. Hydration depth max 1 (no
   *  recursion: repost of repost still shows the original target only). */
  repostOf: PostCardData | null;
  /** Tombstone: null se il target esiste, l'oggetto se è stato cancellato.
   *  Mai entrambi non-null contemporaneamente. */
  repostOfTombstone: { id: string } | null;
  editedAt: Date | null;
  createdAt: Date;
  counts: PostCounts;
  tickers: string[];
  media: PostMediaPublic[];
  viewer: PostViewerState | null;
};

export type PostListPage = {
  ids: string[];
  nextCursor: string | null;
};

export type CommentReactionCounts = PostReactionCounts;

/** Counts denormalizzati sul commento. Mantenuto separato da PostCounts
 *  perché un commento NON ha sub-counter (no repost/bookmark/sub-comments). */
export type CommentCounts = {
  reactions: CommentReactionCounts;
  reactionsTotal: number;
};

/** Stato viewer-specific sul commento. Speculare a PostViewerState ma
 *  senza il flag bookmarked (i commenti non sono bookmarkabili). */
export type CommentViewerState = {
  ownReactions: PostReactionKind[];
};

export type CommentCardData = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  author: PostAuthorPublic;
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  counts: CommentCounts;
  viewer: CommentViewerState | null;
};

/**
 * Variante "root commento" arricchita con `repliesCount`. La query del
 * thread carica i root con repliesCount in 1 sola query (subquery scalare
 * con count parziale sull'indice idx_posts_comments_replies). Lato UI
 * `repliesCount > 0` ⇒ mostra "Mostra altre N risposte" oppure il pannello
 * tombstone se tutti i reply sono soft-deleted (caso raro).
 */
export type CommentRootCardData = CommentCardData & {
  repliesCount: number;
};

export type CommentsRootPage = {
  comments: CommentRootCardData[];
  nextCursor: string | null;
};

export type CommentRepliesPage = {
  replies: CommentCardData[];
  nextCursor: string | null;
};

/**
 * @deprecated mantenuto per backward-compat finché tutti i call site
 * passano a `CommentsRootPage`. Da rimuovere a chiusura della PR-comments.
 */
export type CommentsPage = {
  comments: CommentCardData[];
  nextCursor: string | null;
};
