// lib/modules/seeders/contributors/comment-reactions-contributor.ts
//
// Reazioni sui commenti seed. Pattern identico a reactions-contributor
// ma su `posts_comment_reactions` invece di `posts_reactions`.
//
//   - ~15% dei commenti riceve ≥1 reaction (piu' sparso delle reactions
//     sui post, realistico: i commenti sono "tier 2" nell'attention)
//   - Per i commenti che ne ricevono: 1 (60%), 2-3 (30%), 4-6 (10%)
//   - Reactor ≠ author del commento (no self-reaction)
//   - Reaction kind mood-biased (stesso preferences del posts-reactions)
//
// Counter denormalizzati su `posts_comments.reactions_*` aggiornati da
// trigger DB (M_posts_008).
import "server-only";

import { db } from "@/lib/db/drizzle";
import { postsCommentReactions, type PostReactionKind } from "@/lib/db/schema";
import type { UserMood } from "../services/mood-types";
import type { SeedUser } from "../services/user-seeder";

const MOOD_REACTION_PREFERENCE: Record<UserMood, PostReactionKind[]> = {
  bullish_btc: ["to_the_moon", "bullish", "like"],
  bearish:     ["bearish", "dump", "like"],
  hodler:      ["like", "bullish"],
  trader:      ["like", "to_the_moon", "bearish"],
  defi:        ["like", "to_the_moon", "bullish"],
  macro:       ["bearish", "like"],
  newbie:      ["like", "to_the_moon"],
  degen:       ["to_the_moon", "bullish", "like"],
};

const REACTION_PICK_WEIGHTS = [50, 25, 15, 10];

function pickReactionForMood(mood: UserMood): PostReactionKind {
  const prefs = MOOD_REACTION_PREFERENCE[mood];
  const weights = REACTION_PICK_WEIGHTS.slice(0, prefs.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < prefs.length; i++) {
    r -= weights[i];
    if (r <= 0) return prefs[i];
  }
  return prefs[0];
}

const COMMENT_RECEIVES_ANY_PROBABILITY = 0.15;

function pickReactorCount(maxReactors: number): number {
  if (maxReactors <= 0) return 0;
  const r = Math.random();
  let count: number;
  if (r < 0.6) count = 1;
  else if (r < 0.9) count = 2 + Math.floor(Math.random() * 2); // 2-3
  else count = 4 + Math.floor(Math.random() * 3); // 4-6
  return Math.min(count, maxReactors);
}

export type SeededCommentReactions = {
  created: number;
};

export async function seedReactionsForComments(
  seedUsers: SeedUser[],
  commentsMeta: Array<{ id: string; authorId: string }>,
): Promise<SeededCommentReactions> {
  if (seedUsers.length < 2 || commentsMeta.length === 0) {
    return { created: 0 };
  }

  type Row = {
    commentId: string;
    userId: string;
    reaction: PostReactionKind;
  };
  const rows: Row[] = [];

  for (const meta of commentsMeta) {
    if (Math.random() >= COMMENT_RECEIVES_ANY_PROBABILITY) continue;

    const reactorPool = seedUsers.filter((u) => u.id !== meta.authorId);
    if (reactorPool.length === 0) continue;

    const maxReactorsPerComment = Math.min(6, reactorPool.length);
    const count = pickReactorCount(maxReactorsPerComment);
    if (count === 0) continue;

    const indices = Array.from({ length: reactorPool.length }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < count; i++) {
      const reactor = reactorPool[indices[i]];
      rows.push({
        commentId: meta.id,
        userId: reactor.id,
        reaction: pickReactionForMood(reactor.mood),
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  // PK = (comment_id, user_id, reaction). onConflictDoNothing defensive
  // contro duplicati di pick (raro col sample-without-replacement).
  await db
    .insert(postsCommentReactions)
    .values(rows)
    .onConflictDoNothing({
      target: [
        postsCommentReactions.commentId,
        postsCommentReactions.userId,
        postsCommentReactions.reaction,
      ],
    });

  return { created: rows.length };
}
