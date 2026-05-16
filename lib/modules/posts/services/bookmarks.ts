// lib/modules/posts/services/bookmarks.ts
//
// Service astratto per i bookmark privati. bookmarks_count su `posts` è
// aggiornato dal trigger DB; qui solo INSERT/DELETE.
//
// Privacy: i bookmark sono privati (visibili solo all'utente). Il
// chiamante NON deve mai esporre `posts_bookmarks` rows di un altro utente.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsBookmarks } from "@/lib/db/schema";

/**
 * Toggle bookmark. Idempotente in entrambe le direzioni.
 * Ritorna lo stato finale dal punto di vista dell'utente.
 */
export async function toggleBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  const removed = await db
    .delete(postsBookmarks)
    .where(
      and(
        eq(postsBookmarks.userId, userId),
        eq(postsBookmarks.postId, postId),
      ),
    )
    .returning({ userId: postsBookmarks.userId });

  if (removed.length > 0) return { bookmarked: false };

  await db
    .insert(postsBookmarks)
    .values({ userId, postId })
    .onConflictDoNothing({
      target: [postsBookmarks.userId, postsBookmarks.postId],
    });

  return { bookmarked: true };
}

/**
 * Check rapido per UI hydration (icona piena vs vuota).
 * V2 potrà cacheare con bitmap su KV — qui SELECT singolo.
 */
export async function isBookmarked(
  userId: string,
  postId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: postsBookmarks.userId })
    .from(postsBookmarks)
    .where(
      and(
        eq(postsBookmarks.userId, userId),
        eq(postsBookmarks.postId, postId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
