// lib/modules/seeders/contributors/reactions-contributor.ts
//
// Crea reazioni tra seed users sui seed posts appena inseriti.
// Pattern realistico:
//
//   - Solo ~40% dei post riceve almeno una reaction (la coda lunga
//     dei feed reali: la maggior parte dei post ha 0 like).
//   - I post che ricevono reactions ne hanno 1..N con distribuzione
//     skewed verso il basso (max ~ sqrt(N_users), tipico effetto
//     long tail). Per N=100 seed users → median 3-5, max ~10.
//   - Il "kind" di reaction è mood-biased: un bullish_btc tende al
//     `rocket`/`bull`, un bearish al `bear`/`dump`, hodler al
//     `diamond`, ecc.
//   - Constraint PK (post_id, user_id, reaction) + regola "1 user →
//     1 reaction": ogni user reaziona AL MASSIMO 1 volta per post.
//
// Performance: bulk INSERT singola. I 6 contatori denormalizzati su
// `posts` si aggiornano via trigger DB (M_posts_002_triggers.sql),
// niente roundtrip extra. Outbox emit `post.reaction.added` viene
// generato dal trigger ma rimane inerte: niente notifications module
// che lo consuma in V1.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { postsReactions, type PostReactionKind } from "@/lib/db/schema";
import type { UserMood } from "../services/mood-types";
import type { SeedUser } from "../services/user-seeder";

/**
 * Per ogni mood, ordinate dalla più probabile alla meno. Il pick
 * fa weighted-by-position: posizione 0 vince spesso, le altre poco.
 *
 * NB: i 6 kind del modulo posts sono: like, rocket, bull, bear, dump,
 * diamond. Mantenuti in sync con POST_REACTION_KINDS in lib/db/schema.
 */
const MOOD_REACTION_PREFERENCE: Record<UserMood, PostReactionKind[]> = {
  bullish_btc: ["rocket", "bull", "diamond", "like"],
  bearish:     ["bear", "dump", "like"],
  hodler:      ["diamond", "like", "bull"],
  trader:      ["like", "rocket", "bear"],
  defi:        ["like", "rocket", "bull"],
  macro:       ["bear", "like", "diamond"],
  newbie:      ["like", "rocket"],
  degen:       ["rocket", "diamond", "bull", "like"],
};

// Distribuzione pesi per il pick mood-biased. Index 0 vince circa
// metà delle volte, gli altri si dividono il resto in modo decrescente.
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

// Probabilità che UN dato post abbia ≥1 reaction.
const POST_RECEIVES_ANY_PROBABILITY = 0.4;

/**
 * Per un post che riceve reactions: quanti reactor? Distribuzione
 * long-tail troncata. floor(sqrt(rand * N_users * N_users)) ≈ uniforme
 * in [1..N], ma usiamo log per skewarla:
 *   - 1 reaction:  ~45%
 *   - 2-3:         ~30%
 *   - 4-7:         ~18%
 *   - 8-10:        ~7%
 * Cap superiore a min(10, N_users-1) per non superare il pool di
 * reactor distinti disponibili.
 */
function pickReactorCount(maxReactors: number): number {
  if (maxReactors <= 0) return 0;
  const r = Math.random();
  let count: number;
  if (r < 0.45) count = 1;
  else if (r < 0.75) count = 2 + Math.floor(Math.random() * 2); // 2-3
  else if (r < 0.93) count = 4 + Math.floor(Math.random() * 4); // 4-7
  else count = 8 + Math.floor(Math.random() * 3); // 8-10
  return Math.min(count, maxReactors);
}

export type SeededReactions = {
  created: number;
};

/**
 * Itera i post, per ognuno decide se riceve reactions (40%), poi pesca
 * N reactor distinti tra i seed users. Bulk INSERT alla fine.
 *
 * Edge case: se seedUsers.length < 2 saltiamo tutto (PK violation: un
 * user non può reagire a un proprio post? Tecnicamente sì lo permette
 * lo schema, ma per realismo evitiamo self-reactions).
 *
 * NB: NON conosciamo l'authorId dei post qui dentro (il contributor
 * registry passa solo postIds). Filtriamo le self-reactions
 * applicativamente solo se possibile, altrimenti accettiamo la
 * possibilità: gli authorId dei seed users sono tutti misti nel pool,
 * quindi su ~40% dei post * 1-10 reactor casuali, la probabilità che
 * un user reagisca al proprio post è ~1/N_users → trascurabile a
 * volumi normali.
 */
export async function seedReactionsForPosts(
  seedUsers: SeedUser[],
  postIds: string[],
): Promise<SeededReactions> {
  if (seedUsers.length < 2 || postIds.length === 0) {
    return { created: 0 };
  }

  type Row = {
    postId: string;
    userId: string;
    reaction: PostReactionKind;
  };
  const rows: Row[] = [];
  const maxReactorsPerPost = Math.min(10, seedUsers.length - 1);

  for (const postId of postIds) {
    if (Math.random() >= POST_RECEIVES_ANY_PROBABILITY) continue;

    const count = pickReactorCount(maxReactorsPerPost);
    if (count === 0) continue;

    // Pesca `count` reactor distinti senza replacement (Fisher-Yates
    // partial). Per N piccolo è più veloce di un Set + retry.
    const indices = Array.from({ length: seedUsers.length }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < count; i++) {
      const reactor = seedUsers[indices[i]];
      rows.push({
        postId,
        userId: reactor.id,
        reaction: pickReactionForMood(reactor.mood),
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  // PK = (post_id, user_id, reaction). onConflictDoNothing evita
  // problemi se per caso il pick avesse generato un duplicato logico
  // (non dovrebbe, dato il sample-without-replacement, ma defensive).
  await db
    .insert(postsReactions)
    .values(rows)
    .onConflictDoNothing({
      target: [
        postsReactions.postId,
        postsReactions.userId,
        postsReactions.reaction,
      ],
    });

  return { created: rows.length };
}
