// lib/modules/social-graph/queries.ts
//
// Read path del modulo social-graph. Convenzioni:
//   - `getFollowingSet(viewerId)` → hot path feed: usa la cache 3-layer
//     (vedi services/follows-cache.ts). Re-exportato qui per comodita'.
//   - `isFollowing(viewer, target)` → check rapido per UI hydration del
//     bottone Follow/Following. Usa la cache (1 SET lookup, O(1)).
//   - `getSocialCounters(userId)` → snapshot counter denorm. LEFT JOIN
//     style: se row counter non esiste (mai seguito ne' essere seguito),
//     ritorna {0, 0}.
//   - `listFollowers(userId, cursor, limit)` / `listFollowing(...)` →
//     liste paginate keyset (per pagine /u/[u]/followers e /following).
//     Cursor = ISO createdAt. Order DESC.
//
// Tutte le funzioni sono server-side; molte sono usate dentro RSC.
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db/drizzle";
import {
  userFollows,
  userSocialCounters,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { getFollowingSet } from "./services/follows-cache";
import type { SocialCounters } from "./types";

export { getFollowingSet };

/**
 * Check rapido "viewer segue target?". Sfrutta il Set cached: 1 SET lookup
 * O(1) dopo il primo load del Set (che a sua volta e' deduplicato per
 * request via React.cache).
 *
 * Per anonimi (viewerId == null) ritorna sempre false senza toccare DB/cache.
 */
export async function isFollowing(
  viewerId: string | null | undefined,
  targetId: string,
): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const set = await getFollowingSet(viewerId);
  return set.has(targetId);
}

/**
 * Snapshot dei counter di un utente. LEFT JOIN-style: se non esiste row
 * in user_social_counters (mai entrato nel grafo), ritorna {0, 0}.
 *
 * React.cache wrap: dedup per request RSC (la profile page chiama lo
 * stesso counter da header + sidebar).
 */
export const getSocialCounters = cache(
  async (userId: string): Promise<SocialCounters> => {
    const rows = await db
      .select({
        followersCount: userSocialCounters.followersCount,
        followingCount: userSocialCounters.followingCount,
      })
      .from(userSocialCounters)
      .where(eq(userSocialCounters.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return { followersCount: 0, followingCount: 0 };
    return row;
  },
);

export type FollowListItem = {
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  createdAt: Date;
};

export type FollowListPage = {
  items: FollowListItem[];
  nextCursor: string | null;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Lista paginata dei follower di `userId` (ordine: piu' recenti prima).
 * Keyset paginato su `created_at` — cursor = ISO string del createdAt
 * dell'ultimo item della pagina precedente.
 */
export async function listFollowers(
  userId: string,
  cursor: string | null,
  limit: number = DEFAULT_PAGE_SIZE,
): Promise<FollowListPage> {
  const cap = Math.min(Math.max(limit, 1), 50);
  const cursorDate = cursor ? new Date(cursor) : null;

  const rows = await db
    .select({
      userId: userFollows.followerId,
      username: userProfiles.username,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
      createdAt: userFollows.createdAt,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, userFollows.followerId))
    .where(
      and(
        eq(userFollows.followedId, userId),
        cursorDate ? lt(userFollows.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(userFollows.createdAt))
    .limit(cap + 1);

  const hasMore = rows.length > cap;
  const items = hasMore ? rows.slice(0, cap) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? items[items.length - 1]!.createdAt.toISOString()
      : null;

  return { items, nextCursor };
}

/**
 * Lista paginata di chi `userId` segue (ordine: piu' recenti prima).
 * Stessa semantica di listFollowers ma rovesciata.
 */
export async function listFollowing(
  userId: string,
  cursor: string | null,
  limit: number = DEFAULT_PAGE_SIZE,
): Promise<FollowListPage> {
  const cap = Math.min(Math.max(limit, 1), 50);
  const cursorDate = cursor ? new Date(cursor) : null;

  const rows = await db
    .select({
      userId: userFollows.followedId,
      username: userProfiles.username,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
      createdAt: userFollows.createdAt,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followedId))
    .leftJoin(userProfiles, eq(userProfiles.userId, userFollows.followedId))
    .where(
      and(
        eq(userFollows.followerId, userId),
        cursorDate ? lt(userFollows.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(userFollows.createdAt))
    .limit(cap + 1);

  const hasMore = rows.length > cap;
  const items = hasMore ? rows.slice(0, cap) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? items[items.length - 1]!.createdAt.toISOString()
      : null;

  return { items, nextCursor };
}

/**
 * Helper SQL fragment per "post di chi il viewer segue".
 * Empty set → undefined (Drizzle skipperà il filtro nel where).
 *
 * Usato dal modulo posts (PR2) nel feed Home following-first.
 */
export function postsFromFollowingFragment(
  followingIds: ReadonlySet<string>,
  authorIdColumn: import("drizzle-orm").Column,
) {
  if (followingIds.size === 0) return undefined;
  const ids = Array.from(followingIds);
  return sql`${authorIdColumn} IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}
