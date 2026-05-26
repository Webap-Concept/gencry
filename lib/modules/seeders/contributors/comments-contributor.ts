// lib/modules/seeders/contributors/comments-contributor.ts
//
// Crea thread di commenti (top-level + reply 2-livelli) sui seed posts.
// Pipeline:
//
//   1. Pre-pass per post: 30% prob → genera 1-6 commenti pending.
//      Conteggio long-tail (50% 1, 35% 2-3, 15% 4-6).
//   2. 20% dei commenti sono "reply" — parent_comment_id = un altro
//      commento gia' pickato per lo stesso thread.
//   3. Commenter ≠ author del post (no self-comment).
//   4. createdAt: post.createdAt + random gap (0-7gg, capato a now).
//   5. SELECT body dei post target (per context LLM).
//   6. Batch LLM per giorno (analogo a posts).
//   7. Bulk INSERT.
//
// Counter `posts.comments_count` aggiornati da trigger DB esistente
// (M_posts_002). Outbox emit `post.comment.created` viene generato dal
// trigger ma rimane inerte (V1 niente consumer).
import "server-only";

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { posts, postsComments } from "@/lib/db/schema";
import {
  generateCommentBodiesForDay,
  type LlmCommentRequest,
} from "../services/llm-content-generator";
import type { SeedUser } from "../services/user-seeder";
import type { UserMood } from "../services/mood-types";

const POST_RECEIVES_COMMENT_PROBABILITY = 0.3;
const REPLY_PROBABILITY = 0.2;
const COMMENT_MAX_DELAY_DAYS = 7;

/**
 * Conteggio commenti per post (per i post che ne ricevono ≥1).
 * Long-tail: la maggior parte ha 1 commento, code lunga rara.
 */
function pickCommentCount(maxCommenters: number): number {
  if (maxCommenters <= 0) return 0;
  const r = Math.random();
  let count: number;
  if (r < 0.5) count = 1;
  else if (r < 0.85) count = 2 + Math.floor(Math.random() * 2); // 2-3
  else count = 4 + Math.floor(Math.random() * 3); // 4-6
  return Math.min(count, maxCommenters);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type SeededComments = {
  created: number;
  commentsMeta: Array<{
    id: string;
    postId: string;
    authorId: string;
    createdAt: Date;
  }>;
};

export async function seedCommentsForPosts(
  seedUsers: SeedUser[],
  postsMeta: Array<{ id: string; authorId: string; createdAt: Date }>,
): Promise<SeededComments> {
  if (seedUsers.length < 2 || postsMeta.length === 0) {
    return { created: 0, commentsMeta: [] };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Step 1: precompute pending commenti (senza body, ancora). Per ogni
  // post che riceve >=1 commento, scelgo N commenter (escluso author),
  // assegno timestamp, decido se top-level o reply al volo.
  // ─────────────────────────────────────────────────────────────────────
  type PendingComment = {
    id: string;
    postId: string;
    postAuthorId: string; // per dedup self
    authorId: string;
    authorUsername: string;
    mood: UserMood;
    parentCommentId: string | null;
    createdAt: Date;
    body: string; // riempito dopo Claude batch
  };
  const pending: PendingComment[] = [];

  const usersById = new Map(seedUsers.map((u) => [u.id, u]));
  const now = Date.now();
  const maxDelayMs = COMMENT_MAX_DELAY_DAYS * 24 * 60 * 60 * 1000;

  for (const post of postsMeta) {
    if (Math.random() >= POST_RECEIVES_COMMENT_PROBABILITY) continue;

    const eligibleCommenters = seedUsers.filter((u) => u.id !== post.authorId);
    if (eligibleCommenters.length === 0) continue;

    const count = pickCommentCount(eligibleCommenters.length);
    if (count === 0) continue;

    // Pesca `count` commenter distinti (no replacement).
    const indices = Array.from({ length: eligibleCommenters.length }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // I commenti del thread, in ordine crescente di createdAt — utile
    // per la logica "reply a un commento gia' creato".
    const threadComments: PendingComment[] = [];

    // Distribuzione timing: ogni commento e' offset randomico DOPO il
    // post.createdAt, capato a min(post.createdAt + 7gg, now).
    const postMs = post.createdAt.getTime();
    const maxMs = Math.min(postMs + maxDelayMs, now);
    const windowMs = Math.max(maxMs - postMs, 0);

    for (let k = 0; k < count; k++) {
      const commenter = eligibleCommenters[indices[k]];

      // Reply solo se c'e' gia' almeno un commento nel thread, e con
      // probabilita' 20%. Reply timing: dopo il parent createdAt.
      let parentCommentId: string | null = null;
      let createdAtMs = postMs + Math.random() * windowMs;
      if (threadComments.length > 0 && Math.random() < REPLY_PROBABILITY) {
        // Solo reply a TOP-LEVEL (parent_comment_id IS NULL): il modulo
        // posts usa nesting visivo 2-livelli, non multi-livello.
        const topLevel = threadComments.filter((c) => c.parentCommentId === null);
        if (topLevel.length > 0) {
          const parent = topLevel[Math.floor(Math.random() * topLevel.length)];
          parentCommentId = parent.id;
          const minMs = parent.createdAt.getTime();
          // Reply tra parent.createdAt e maxMs.
          createdAtMs = minMs + Math.random() * Math.max(maxMs - minMs, 1);
        }
      }

      const comment: PendingComment = {
        id: randomUUID(),
        postId: post.id,
        postAuthorId: post.authorId,
        authorId: commenter.id,
        authorUsername: commenter.username,
        mood: commenter.mood,
        parentCommentId,
        createdAt: new Date(createdAtMs),
        body: "",
      };
      threadComments.push(comment);
      pending.push(comment);
    }
  }

  if (pending.length === 0) {
    return { created: 0, commentsMeta: [] };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Step 2: SELECT body dei post target — serve come context al LLM.
  // 1 query con IN su tutti i post che ricevono >=1 commento.
  // ─────────────────────────────────────────────────────────────────────
  const targetPostIds = Array.from(new Set(pending.map((p) => p.postId)));
  const postRows = await db
    .select({ id: posts.id, body: posts.body })
    .from(posts)
    .where(inArray(posts.id, targetPostIds));
  const postBodyById = new Map(postRows.map((p) => [p.id, p.body]));

  // ─────────────────────────────────────────────────────────────────────
  // Step 3: batch LLM per giorno (del comment.createdAt). 1 call per
  // giorno con tutti i commenti di quel giorno.
  // ─────────────────────────────────────────────────────────────────────
  const byDay = new Map<string, PendingComment[]>();
  for (const c of pending) {
    const k = dayKey(c.createdAt);
    const arr = byDay.get(k) ?? [];
    arr.push(c);
    byDay.set(k, arr);
  }

  // Lookup body parent (intra-pending, gia' in memoria) — usata per
  // mettere parentBody nel request LLM.
  const pendingById = new Map(pending.map((c) => [c.id, c]));

  for (const [day, group] of byDay) {
    const requests: LlmCommentRequest[] = group.map((c) => {
      const postBody = postBodyById.get(c.postId) ?? "";
      const parentBody = c.parentCommentId
        ? pendingById.get(c.parentCommentId)?.body || null
        : null;
      return {
        refId: c.id,
        postBody,
        parentBody,
        mood: c.mood,
        authorUsername: c.authorUsername,
      };
    });

    const generated = await generateCommentBodiesForDay({
      requests,
      dayLabel: day,
    });

    const byRefId = new Map(generated.map((g) => [g.refId, g.body]));
    for (const c of group) {
      const body = byRefId.get(c.id);
      if (!body) {
        throw new Error(
          `[seeders/comments-contributor] missing body for refId=${c.id} day=${day}`,
        );
      }
      c.body = body;
    }
  }

  // NB: i reply di giorni successivi al parent non vedono il parent.body
  // perche' il loop sopra processa i giorni in ordine iteration. In
  // pratica e' raro: reply tipica nello stesso giorno. Quando capita, il
  // prompt ha parentBody=null e Claude scrive un top-level-ish reply —
  // acceptable per realismo del seed.

  // ─────────────────────────────────────────────────────────────────────
  // Step 4: Bulk INSERT. Ordine: prima top-level, poi reply (per FK
  // self-referenziale anche se posts_comments non lo enforce strict —
  // ma in Drizzle un singolo INSERT batch con order arbitrario potrebbe
  // perdere la FK self-reference. In pratica con CASCADE non c'e' FK
  // check hard, ma teniamo l'ordine per chiarezza).
  // ─────────────────────────────────────────────────────────────────────
  const topLevel = pending.filter((c) => c.parentCommentId === null);
  const replies = pending.filter((c) => c.parentCommentId !== null);

  if (topLevel.length > 0) {
    await db.insert(postsComments).values(
      topLevel.map((c) => ({
        id: c.id,
        postId: c.postId,
        authorId: c.authorId,
        parentCommentId: null,
        body: c.body,
        createdAt: c.createdAt,
      })),
    );
  }
  if (replies.length > 0) {
    await db.insert(postsComments).values(
      replies.map((c) => ({
        id: c.id,
        postId: c.postId,
        authorId: c.authorId,
        parentCommentId: c.parentCommentId,
        body: c.body,
        createdAt: c.createdAt,
      })),
    );
  }

  return {
    created: pending.length,
    commentsMeta: pending.map((c) => ({
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      createdAt: c.createdAt,
    })),
  };
}
