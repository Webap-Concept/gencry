// lib/modules/seeders/contributors/posts-contributor.ts
//
// Crea post variati per ogni seed user passato. Body con placeholder
// risolti (ticker random da coin attivi, mention random da altri seed
// users), date sparpagliate negli ultimi 7 giorni per popolare la
// timeline cronologica. Opzionale: posts con immagini (URL Picsum
// deterministici, niente upload R2).
//
// Sync di posts_tickers + posts_mentions tramite extractTickers /
// extractMentions del modulo posts — coerente con la pipeline normale
// del `createPost` action. Counter denormalizzati (reactions_*,
// comments_count) restano a 0, aggiornati da trigger DB se in futuro
// seedingiamo anche reactions/comments.
import "server-only";

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  posts,
  postsMedia,
  postsMentions,
  postsTickers,
  userProfiles,
} from "@/lib/db/schema";
import {
  extractMentions,
  extractTickers,
} from "@/lib/modules/posts/lib/parsing";
import { getCoinNameMap } from "@/lib/modules/prices/queries";
import { POST_BODY_TEMPLATES_IT, POST_URL_POOL } from "../services/content-templates-it";
import type { SeedUser } from "../services/user-seeder";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Risolvi i placeholder `{ticker}`, `{ticker_name}`, `{mention}`,
 * `{url}` in un template con valori random. `coinNameMap` è la mappa
 * lowercase-name → SYMBOL (es. "bitcoin" → "BTC"); estraggo simboli
 * dal map per il `{ticker}` (es. "$BTC") e i nomi per `{ticker_name}`.
 */
function resolveTemplate(
  template: string,
  coinNameMap: Record<string, string>,
  otherSeedUsernames: string[],
): string {
  const coinNames = Object.keys(coinNameMap); // lowercase names
  const coinSymbols = Array.from(new Set(Object.values(coinNameMap))); // SYMBOL

  return template
    .replace(/\{ticker\}/g, () =>
      coinSymbols.length > 0 ? `$${pick(coinSymbols)}` : "$BTC",
    )
    .replace(/\{ticker_name\}/g, () => {
      if (coinNames.length === 0) return "Bitcoin";
      const name = pick(coinNames);
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1);
    })
    .replace(/\{mention\}/g, () => {
      if (otherSeedUsernames.length === 0) return "@admin";
      return `@${pick(otherSeedUsernames)}`;
    })
    .replace(/\{url\}/g, () => pick(POST_URL_POOL));
}

export type SeedPostsOptions = {
  postsPerUser: number;
  withImages: boolean;
};

export async function seedPostsForUsers(
  seedUsers: SeedUser[],
  opts: SeedPostsOptions,
): Promise<{ created: number }> {
  if (seedUsers.length === 0 || opts.postsPerUser <= 0) {
    return { created: 0 };
  }

  const coinNameMap = await getCoinNameMap();
  const usernames = seedUsers.map((u) => u.username);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Pre-compute tutti i post in memoria, poi 1 bulk INSERT.
  type PendingPost = {
    id: string; // generato client-side per linkare media in bulk
    authorId: string;
    body: string;
    visibility: "public" | "members";
    createdAt: Date;
    withImage: boolean;
  };
  const pending: PendingPost[] = [];

  for (const user of seedUsers) {
    const otherUsernames = usernames.filter((u) => u !== user.username);

    for (let i = 0; i < opts.postsPerUser; i++) {
      const template = pick(POST_BODY_TEMPLATES_IT);
      const body = resolveTemplate(template, coinNameMap, otherUsernames);
      // visibility distribution: 90% public, 10% members (testing della
      // filtering logic). Niente followers/private — sarebbero invisibili
      // a tutti gli altri seed users senza un follow graph.
      const visibility = Math.random() < 0.1 ? ("members" as const) : ("public" as const);
      // CreatedAt spalmato negli ultimi 7 giorni → timeline realistica.
      const createdAt = new Date(now - Math.random() * sevenDaysMs);
      // 30% dei post ha immagine se opts.withImages è attivo.
      const withImage = opts.withImages && Math.random() < 0.3;

      pending.push({
        id: randomUUID(),
        authorId: user.id,
        body,
        visibility,
        createdAt,
        withImage,
      });
    }
  }

  if (pending.length === 0) return { created: 0 };

  // Bulk INSERT posts. uuid_generate_v7 viene generato dal default SQL;
  // non lo specifichiamo qui (lasciamo che il DB lo faccia) — ma allora
  // non posso linkare media subito. Trick: uso randomUUID() lato JS e
  // bypasso il default v7 passando un id esplicito. Trade-off: id v4
  // invece di v7 → keyset cursor su id va in random order all'interno
  // dello stesso created_at. Accettabile per seed data (la timeline
  // primaria è created_at, id è solo tie-break).
  await db.insert(posts).values(
    pending.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      body: p.body,
      visibility: p.visibility,
      createdAt: p.createdAt,
    })),
  );

  // Sync posts_tickers e posts_mentions per ogni post (uniforme con
  // la pipeline normale). Estrazione async (chiama getCoinNameMap →
  // cached) → batch INSERT in 2 query alla fine.
  const allTickerRows: Array<{
    postId: string;
    ticker: string;
    createdAt: Date;
  }> = [];
  const allMentionRows: Array<{
    postId: string;
    mentionedUserId: string;
    createdAt: Date;
  }> = [];
  // Resolve mention usernames → user ids in 1 query batch.
  const allMentionUsernames = new Set<string>();
  const perPostMentions: Array<{ postId: string; usernames: string[]; createdAt: Date }> = [];

  for (const p of pending) {
    const tickers = await extractTickers(p.body, coinNameMap);
    for (const t of tickers) {
      allTickerRows.push({ postId: p.id, ticker: t, createdAt: p.createdAt });
    }
    const mentions = extractMentions(p.body);
    const mentionsArr = Array.from(mentions);
    for (const m of mentionsArr) allMentionUsernames.add(m);
    if (mentionsArr.length > 0) {
      perPostMentions.push({ postId: p.id, usernames: mentionsArr, createdAt: p.createdAt });
    }
  }

  if (allTickerRows.length > 0) {
    await db.insert(postsTickers).values(allTickerRows).onConflictDoNothing();
  }

  if (perPostMentions.length > 0 && allMentionUsernames.size > 0) {
    // 1 batch lookup di tutti gli username menzionati → user_id
    const usernameRows = await db
      .select({ userId: userProfiles.userId, username: userProfiles.username })
      .from(userProfiles)
      .where(inArray(userProfiles.username, Array.from(allMentionUsernames)));
    const idByUsername = new Map(
      usernameRows
        .filter((r): r is { userId: string; username: string } => !!r.username)
        .map((r) => [r.username, r.userId]),
    );
    for (const pm of perPostMentions) {
      for (const u of pm.usernames) {
        const mentionedUserId = idByUsername.get(u);
        if (mentionedUserId) {
          allMentionRows.push({
            postId: pm.postId,
            mentionedUserId,
            createdAt: pm.createdAt,
          });
        }
      }
    }
    if (allMentionRows.length > 0) {
      await db
        .insert(postsMentions)
        .values(allMentionRows)
        .onConflictDoNothing();
    }
  }

  // Media: per i post con withImage, INSERT in posts_media con URL
  // Picsum deterministico. Niente upload R2 (sono solo URL esterni
  // direttamente riferiti come full_url/thumb_url).
  const mediaRows = pending
    .filter((p) => p.withImage)
    .map((p) => {
      const seed = p.id.slice(0, 8);
      return {
        postId: p.id,
        authorId: p.authorId,
        storageKey: `seed/picsum/${seed}`,
        fullUrl: `https://picsum.photos/seed/${seed}/1024/640`,
        thumbUrl: `https://picsum.photos/seed/${seed}/400/250`,
        mimeType: "image/jpeg",
        width: 1024,
        height: 640,
        sizeBytes: 100_000,
        position: 0,
        confirmedAt: p.createdAt,
        createdAt: p.createdAt,
      };
    });
  if (mediaRows.length > 0) {
    await db.insert(postsMedia).values(mediaRows);
  }

  return { created: pending.length };
}
