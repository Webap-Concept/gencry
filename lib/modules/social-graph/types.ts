// lib/modules/social-graph/types.ts
//
// Tipi condivisi del modulo social-graph. Niente runtime: solo type defs.

/** Risultato di una mutation follow/unfollow esposta come Server Action. */
export type FollowResult =
  | { ok: true; following: boolean; followersCount: number; followingCount: number }
  | { ok: false; error: FollowErrorCode; retryAfter?: number };

/** Codici errore tipizzati. La UI li mappa a i18n keys `socialGraph.errors.*`. */
export type FollowErrorCode =
  | "unauthenticated"
  | "self_follow"
  | "target_not_found"
  | "blocked"
  | "rate_limited"
  | "internal";

/** Snapshot dei counter per un utente. */
export type SocialCounters = {
  followersCount: number;
  followingCount: number;
};
