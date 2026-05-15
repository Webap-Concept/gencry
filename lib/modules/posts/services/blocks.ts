// lib/modules/posts/services/blocks.ts
//
// Service astratto per i block mutual tra utenti del modulo Posts.
// Semantica: se A blocca B, NESSUNO dei due vede contenuti dell'altro.
// Una sola riga (blocker_id=A, blocked_id=B) basta; il filtro nel feed
// fa OR su entrambe le direzioni.
//
// V1 → pass-through DB. V2 → precaricamento del Set in KV Upstash per
// fan-out feed (vedi memory project_block_kv_set_followup).
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsUserBlocks } from "@/lib/db/schema";

/**
 * Toggle block mutuale. Idempotente in entrambe le direzioni.
 * Ritorna lo stato finale dal punto di vista del blocker.
 *
 * Self-block è impedito dal CHECK constraint SQL (no_self_chk) ma lo
 * gateamo anche qui per dare errore tipizzato invece di un DB error.
 */
export async function toggleUserBlock(
  blockerId: string,
  blockedId: string,
): Promise<{ blocked: boolean }> {
  if (blockerId === blockedId) {
    throw new Error("cannot_block_self");
  }

  const removed = await db
    .delete(postsUserBlocks)
    .where(
      and(
        eq(postsUserBlocks.blockerId, blockerId),
        eq(postsUserBlocks.blockedId, blockedId),
      ),
    )
    .returning({ blockerId: postsUserBlocks.blockerId });

  if (removed.length > 0) return { blocked: false };

  await db
    .insert(postsUserBlocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing({
      target: [postsUserBlocks.blockerId, postsUserBlocks.blockedId],
    });

  return { blocked: true };
}

/**
 * Check rapido per UI hydration: "il viewer ha bloccato l'autore O
 * l'autore ha bloccato il viewer?". Usato per nascondere il singolo
 * post in `/post/[id]` (404) e per gating UI su profili.
 *
 * Mutual: una sola riga in qualsiasi direzione basta a creare il muro.
 */
export async function isBlockedBetween(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (userA === userB) return false;
  const rows = await db
    .select({ blockerId: postsUserBlocks.blockerId })
    .from(postsUserBlocks)
    .where(
      or(
        and(
          eq(postsUserBlocks.blockerId, userA),
          eq(postsUserBlocks.blockedId, userB),
        ),
        and(
          eq(postsUserBlocks.blockerId, userB),
          eq(postsUserBlocks.blockedId, userA),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * SQL fragment riusabile per filtri feed/list: esclude i post il cui
 * `author_id` ha una qualsiasi relazione di block con il viewer.
 *
 * Uso: `where(and(..., notBlockedBy(viewerId)))`.
 *
 * Implementato come NOT EXISTS su `posts_user_blocks` con OR sulle due
 * direzioni. Index seek su PK + idx_blocked: cost trascurabile a bassa
 * scala. Per scaling vedi memory project_block_kv_set_followup.
 *
 * Importante: il caller deve garantire che `viewerId` sia uno user_id
 * valido. Per anonimi, NON applicare il filtro (passa attorno).
 */
export function notBlockedBy(viewerId: string, authorIdColumn = "posts.author_id") {
  return sql`NOT EXISTS (
    SELECT 1 FROM posts_user_blocks pb
    WHERE (pb.blocker_id = ${viewerId} AND pb.blocked_id = ${sql.raw(authorIdColumn)})
       OR (pb.blocked_id = ${viewerId} AND pb.blocker_id = ${sql.raw(authorIdColumn)})
  )`;
}
