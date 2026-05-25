// lib/modules/posts/services/blocks.ts
//
// Service astratto per i block mutual tra utenti del modulo Posts.
// Semantica: se A blocca B, NESSUNO dei due vede contenuti dell'altro.
// Una sola riga (blocker_id=A, blocked_id=B) basta; il filtro nel feed
// fa OR su entrambe le direzioni.
//
// V1 → pass-through DB (NOT EXISTS sub-query per riga).
// V2 → precaricamento del Set in KV Upstash per fan-out feed. Stato:
//      attivo dal 2026-05-25 per i 5 hot path del feed (getFeedIds,
//      getProfileFeedIds, getTickerFeedIds, getMentionsFeedIds,
//      selectPostsCore via getPostsByIds). Caller non-feed (raw SQL
//      polling commenti, replies window) restano su sub-query.
import { cache } from "react";
import { and, eq, or, sql, type Column } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { postsUserBlocks } from "@/lib/db/schema";
import { getRedisClient } from "@/lib/kv/sdk";

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
 * autore ha una qualsiasi relazione di block con il viewer.
 *
 * Uso: `where(and(..., notBlockedBy(viewerId, posts.authorId)))`.
 *
 * Implementato come NOT EXISTS su `posts_user_blocks` con OR sulle due
 * direzioni (mutual). Index seek su PK + idx_blocked: cost trascurabile
 * a bassa scala. Per i 5 hot path del feed usiamo la variante KV-set
 * `notBlockedByIds` (precarica il Set 1 volta per request, 1 fetch KV
 * vs N sub-query DB).
 *
 * Importante: il caller deve garantire che `viewerId` sia uno user_id
 * valido. Per anonimi, NON applicare il filtro (passa attorno).
 *
 * `authorIdColumn` è una Column Drizzle (es. `posts.authorId` o
 * `postsComments.authorId`) così l'interpolazione genera il nome
 * quotato correttamente — `sql.raw("posts.author_id")` non risolve
 * nello scope della query quando Drizzle alias-quota le tabelle.
 */
export function notBlockedBy(viewerId: string, authorIdColumn: Column) {
  return sql`NOT EXISTS (
    SELECT 1 FROM posts_user_blocks pb
    WHERE (pb.blocker_id = ${viewerId} AND pb.blocked_id = ${authorIdColumn})
       OR (pb.blocked_id = ${viewerId} AND pb.blocker_id = ${authorIdColumn})
  )`;
}

// ─────────────────────────────────────────────────────────────────────────
// KV-set block precomputato (V2 — fan-out feed)
// ─────────────────────────────────────────────────────────────────────────
//
// Pattern allineato a feedback_redis_consumer_optimization_pattern:
//   - L0 React.cache → 1 fetch per request anche con N caller paralleli.
//   - L1 in-process Map TTL 30s → assorbe i picchi nello stesso lambda warm.
//   - L2 Upstash KV TTL 5min → stale-tollerabile (block è azione rara
//        e mutual; al massimo un post di troppo per qualche secondo).
//   - L3 DB UNION → fallback su miss totale, o se Upstash non configurato.
//
// Safe defaults: ogni errore (KV down, network, parse) → Set vuoto, mai
// throw. Conservativo (mostra TUTTO) ma `isBlockedBetween` resta come
// gate forte su `/post/[id]` → niente leak su single-post view.

const KV_KEY_PREFIX = "posts:blocks:user:";
const KV_TTL_SECONDS = 5 * 60;
const LOCAL_TTL_MS = 30_000;
const LOCAL_CAP = 500;

type LocalEntry = { value: ReadonlySet<string>; expiry: number };
const localBlockCache = new Map<string, LocalEntry>();

function kvKey(viewerId: string): string {
  return `${KV_KEY_PREFIX}${viewerId}`;
}

function localGet(viewerId: string): ReadonlySet<string> | null {
  const now = Date.now();
  const hit = localBlockCache.get(viewerId);
  if (!hit) return null;
  if (now >= hit.expiry) {
    localBlockCache.delete(viewerId);
    return null;
  }
  return hit.value;
}

function localSet(viewerId: string, value: ReadonlySet<string>): void {
  if (localBlockCache.size >= LOCAL_CAP) {
    const now = Date.now();
    for (const [k, entry] of localBlockCache) {
      if (now >= entry.expiry) localBlockCache.delete(k);
    }
    if (localBlockCache.size >= LOCAL_CAP) {
      const firstKey = localBlockCache.keys().next().value;
      if (firstKey) localBlockCache.delete(firstKey);
    }
  }
  localBlockCache.set(viewerId, { value, expiry: Date.now() + LOCAL_TTL_MS });
}

async function loadFromDb(viewerId: string): Promise<string[]> {
  // UNION: tutti gli id che hanno una relazione di block con viewerId
  // (in qualsiasi direzione). Mutual: basta una riga per nascondere
  // i contenuti reciproci.
  const rows = await db.execute<{ id: string }>(sql`
    SELECT blocked_id AS id FROM posts_user_blocks WHERE blocker_id = ${viewerId}
    UNION
    SELECT blocker_id AS id FROM posts_user_blocks WHERE blocked_id = ${viewerId}
  `);
  // db.execute con SQL raw può restituire { rows } o un array a seconda
  // del driver. Normalizziamo difensivamente.
  const list = Array.isArray(rows)
    ? (rows as Array<{ id: string }>)
    : ((rows as { rows?: Array<{ id: string }> }).rows ?? []);
  return list.map((r) => r.id);
}

/**
 * Carica il Set degli id bloccati per il viewer applicando i 3 layer di
 * cache. Idempotente, never-throw: in caso di problemi infrastrutturali
 * cade su DB; se anche il DB fallisce ritorna Set vuoto (no leak, ma
 * non rompe la feed).
 *
 * React.cache wrap garantisce 1 sola esecuzione per request RSC anche
 * se più query del feed la invocano in parallelo.
 */
export const getBlockedIdsForViewer = cache(
  async (viewerId: string): Promise<ReadonlySet<string>> => {
    const local = localGet(viewerId);
    if (local) return local;

    const k = kvKey(viewerId);
    const client = await getRedisClient();

    if (client) {
      try {
        const hit = await client.get<string[]>(k);
        if (Array.isArray(hit)) {
          const set = new Set(hit);
          localSet(viewerId, set);
          return set;
        }
      } catch (err) {
        console.warn("[blocks-kv] read miss-on-error", {
          viewerId,
          err: String(err),
        });
      }
    }

    let ids: string[] = [];
    try {
      ids = await loadFromDb(viewerId);
    } catch (err) {
      console.warn("[blocks-kv] db fallback failed — returning empty set", {
        viewerId,
        err: String(err),
      });
      const empty = new Set<string>();
      localSet(viewerId, empty);
      return empty;
    }

    const set = new Set(ids);
    localSet(viewerId, set);

    if (client) {
      try {
        // Cachiamo l'array (più compatto del Set JSON). TTL 5min.
        await client.set(k, ids, { ex: KV_TTL_SECONDS });
      } catch (err) {
        console.warn("[blocks-kv] write failed", {
          viewerId,
          err: String(err),
        });
      }
    }

    return set;
  },
);

/**
 * SQL fragment alternativo a `notBlockedBy` che usa il Set precomputato.
 * Empty-set → `undefined` (no filtro applicato — Drizzle gestisce gli
 * undefined dentro `and(...)` ignorandoli). Set con N>0 elementi →
 * `author_id NOT IN (...)` con binding singolo per id.
 *
 * Per anonimi (Set null/undefined) NON chiamare questa funzione, passa
 * `undefined` al where invece.
 */
export function notBlockedByIds(
  blockedIds: ReadonlySet<string>,
  authorIdColumn: Column,
) {
  if (blockedIds.size === 0) return undefined;
  const ids = Array.from(blockedIds);
  return sql`${authorIdColumn} NOT IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

/**
 * Invalida la chiave KV + L1 in-process per uno specifico utente.
 * `toggleUserBlock` deve invocarla per ENTRAMBI gli utenti (blocker e
 * blocked) perché il block è mutual: anche il bloccato vede cambiare
 * il proprio Set (acquisisce il blocker).
 *
 * Idempotente, never-throw.
 */
export async function invalidateBlockedIdsForViewer(
  viewerId: string,
): Promise<void> {
  localBlockCache.delete(viewerId);
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.del(kvKey(viewerId));
  } catch (err) {
    console.warn("[blocks-kv] invalidate failed", {
      viewerId,
      err: String(err),
    });
  }
}
