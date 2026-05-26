// lib/modules/seeders/registry.ts
//
// Registry esplicito dei contributors. Quando arriva un nuovo modulo
// (es. comments, predictions), aggiunge il suo contributor a questa
// lista e si attiva automaticamente nel run admin senza toccare
// `actions.ts` o l'UI.
//
// Ogni contributor implementa l'interfaccia { name, run(ctx) }. Il
// runner in `actions.ts` itera in ordine, passando il SeedRunContext
// che contiene gli `users` creati a monte (così posts può creare post
// per quegli users, reactions può reagire a quei post, ecc.).
//
// Pattern: i contributor NON si chiamano fra loro. Tutto lo state
// condiviso passa dal SeedRunContext mutato in-place dal runner. Così
// l'ordine è esplicito e testabile, e si può attivare/disattivare un
// contributor singolo senza rompere quelli a valle (es. "voglio solo
// users + posts, niente reactions" → enabled:false sul contributor).
import type { SeedUser } from "./services/user-seeder";
import {
  seedPostsForUsers,
  type SeedPostsOptions,
} from "./contributors/posts-contributor";
import { seedBlocksForUsers } from "./contributors/blocks-contributor";
import {
  seedReactionsForPosts,
  type SeededReactions,
} from "./contributors/reactions-contributor";
import {
  seedCommentsForPosts,
  type SeededComments,
} from "./contributors/comments-contributor";
import {
  seedReactionsForComments,
  type SeededCommentReactions,
} from "./contributors/comment-reactions-contributor";

/**
 * Metadati di un post creato dal posts-contributor. Aggiunti rispetto
 * alla V1 (che esponeva solo `postIds: string[]`) perche':
 *   - comments-contributor deve evitare self-comments (commenter ≠ author)
 *     e timing comment.created_at > post.created_at
 *   - reactions-contributor puo' ora filtrare self-reactions (cosa che
 *     in V1 accettava per semplicita')
 */
export type SeedPostMeta = {
  id: string;
  authorId: string;
  createdAt: Date;
};

/**
 * Metadati di un commento creato dal comments-contributor. Consumati dal
 * comment-reactions-contributor (analogo a SeedPostMeta).
 */
export type SeedCommentMeta = {
  id: string;
  postId: string;
  authorId: string;
  createdAt: Date;
};

/**
 * Stato accumulato durante un run. I contributor a valle leggono ciò
 * che quelli a monte hanno prodotto.
 */
export type SeedRunContext = {
  users: SeedUser[];
  /** Post creati dal posts-contributor. */
  postsMeta: SeedPostMeta[];
  /** Commenti creati dal comments-contributor. */
  commentsMeta: SeedCommentMeta[];
};

/**
 * Opzioni esposte dall'UI admin. Ogni flag controlla l'attivazione di
 * un singolo contributor.
 */
export type SeederOptions = {
  postsPerUser: number;
  withImages: boolean;
  withBlocks: boolean;
  withReactions: boolean;
  withComments: boolean;
  withCommentReactions: boolean;
};

/**
 * Output strutturato del run. Ogni contributor riporta i count di ciò
 * che ha creato — l'UI li mostra in ResultPanel.
 */
export type SeederRunOutput = {
  usersCreated: number;
  postsCreated: number;
  blocksCreated: number;
  reactionsCreated: number;
  commentsCreated: number;
  commentReactionsCreated: number;
};

/**
 * Contract di un SeederContributor. `enabled(opts)` decide se il
 * contributor deve girare per questo run (es. blocks: false ↔ skip).
 * `run(ctx, opts)` esegue e ritorna delta-counts che il runner
 * accumula nell'output finale.
 */
export type SeederContributor = {
  name: string;
  enabled: (opts: SeederOptions) => boolean;
  run: (
    ctx: SeedRunContext,
    opts: SeederOptions,
  ) => Promise<Partial<SeederRunOutput>>;
};

/**
 * Registro ordinato. L'ordine conta: posts DEVE girare prima di
 * reactions (reactions ha bisogno dei postIds in ctx). blocks è
 * indipendente — lo mettiamo per ultimo perché è il meno critico.
 *
 * Per aggiungere un contributor (es. comments futuro):
 *   1. Crea `contributors/comments-contributor.ts`
 *   2. Importa qui e push in SEEDER_CONTRIBUTORS in posizione corretta
 *      (comments dopo posts, prima/dopo reactions a piacere)
 *   3. Aggiungi il flag `withComments` in SeederOptions + UI checkbox
 *   4. Aggiungi `commentsCreated` in SeederRunOutput
 * Nessuna altra modifica.
 */
export const SEEDER_CONTRIBUTORS: SeederContributor[] = [
  {
    name: "posts",
    enabled: (opts) => opts.postsPerUser > 0,
    run: async (ctx, opts) => {
      const seedPostsOpts: SeedPostsOptions = {
        postsPerUser: opts.postsPerUser,
        withImages: opts.withImages,
      };
      const res = await seedPostsForUsers(ctx.users, seedPostsOpts);
      ctx.postsMeta.push(...res.postsMeta);
      return { postsCreated: res.created };
    },
  },
  {
    name: "reactions",
    enabled: (opts) => opts.withReactions && opts.postsPerUser > 0,
    run: async (ctx): Promise<Partial<SeederRunOutput>> => {
      if (ctx.postsMeta.length === 0) return { reactionsCreated: 0 };
      const res: SeededReactions = await seedReactionsForPosts(
        ctx.users,
        ctx.postsMeta,
      );
      return { reactionsCreated: res.created };
    },
  },
  {
    name: "comments",
    enabled: (opts) => opts.withComments && opts.postsPerUser > 0,
    run: async (ctx): Promise<Partial<SeederRunOutput>> => {
      if (ctx.postsMeta.length === 0) return { commentsCreated: 0 };
      const res: SeededComments = await seedCommentsForPosts(
        ctx.users,
        ctx.postsMeta,
      );
      ctx.commentsMeta.push(...res.commentsMeta);
      return { commentsCreated: res.created };
    },
  },
  {
    name: "comment-reactions",
    enabled: (opts) =>
      opts.withCommentReactions && opts.withComments && opts.postsPerUser > 0,
    run: async (ctx): Promise<Partial<SeederRunOutput>> => {
      if (ctx.commentsMeta.length === 0) return { commentReactionsCreated: 0 };
      const res: SeededCommentReactions = await seedReactionsForComments(
        ctx.users,
        ctx.commentsMeta,
      );
      return { commentReactionsCreated: res.created };
    },
  },
  {
    name: "blocks",
    enabled: (opts) => opts.withBlocks,
    run: async (ctx) => {
      const res = await seedBlocksForUsers(ctx.users);
      return { blocksCreated: res.created };
    },
  },
];
