// lib/modules/seeders/contributors/posts-contributor.ts
//
// Crea post variati per ogni seed user. Tre layer di realismo:
//
//   1. Mood-driven pool: ogni user ha un archetype (bullish_btc,
//      bearish, hodler, trader, defi, macro, newbie, degen) assegnato
//      al seed time. I template del post arrivano dal sub-pool del
//      suo mood + un mix GENERIC (60% mood, 40% generic).
//
//   2. Meta-site override: 10% dei post (max 1 per user) usa template
//      META_SITE_TEMPLATES_IT ("bel sito", "primo post qui", ecc.).
//      Mai negativi, mix positivi/neutri.
//
//   3. Trend-aware ticker pick: per template con {ticker}, il symbol
//      scelto è coerente col mood:
//         - bullish_btc / degen → coin in crescita reale (>=+5% in 7d)
//         - bearish / macro     → coin in calo reale (<=-5% in 7d)
//         - altri               → qualsiasi
//      Calcolo basato su prices_history (zero costi esterni).
//
// Sync di posts_tickers + posts_mentions tramite extractTickers /
// extractMentions del modulo posts — coerente con la pipeline normale.
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
import {
  GENERIC_TEMPLATES_IT,
  META_SITE_TEMPLATES_IT,
  POST_URL_POOL,
  TEMPLATES_BY_MOOD,
} from "../services/content-templates-it";
import {
  MOOD_TREND_PREFERENCE,
  type UserMood,
} from "../services/mood-types";
import {
  analyzeCoinTrends,
  trendLabel,
  type CoinTrend,
} from "../services/price-trend-analyzer";
import type { SeedUser } from "../services/user-seeder";

const META_POST_PROBABILITY = 0.1;
const GENERIC_POOL_WEIGHT = 0.4; // 40% generic, 60% mood-specific

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Sceglie un template tipico del mood, con 40% di chance di pescare
 * un template GENERIC neutro (per non sembrare "monoclima").
 */
function pickTemplateForMood(mood: UserMood): string {
  if (Math.random() < GENERIC_POOL_WEIGHT) {
    return pick(GENERIC_TEMPLATES_IT);
  }
  return pick(TEMPLATES_BY_MOOD[mood]);
}

/**
 * Symbol pick coerente col mood. Se il mood richiede bullish/bearish
 * e ci sono coin nel bucket richiesto, peschiamo da lì. Altrimenti
 * fallback a qualsiasi coin attivo.
 */
function pickTickerForMood(
  mood: UserMood,
  trends: CoinTrend[],
  allSymbols: string[],
): { symbol: string; trend: CoinTrend | undefined } {
  const pref = MOOD_TREND_PREFERENCE[mood];
  if (pref === "bullish") {
    const bullish = trends.filter((t) => t.bucket === "bullish");
    if (bullish.length > 0) {
      const t = pick(bullish);
      return { symbol: t.symbol, trend: t };
    }
  } else if (pref === "bearish") {
    const bearish = trends.filter((t) => t.bucket === "bearish");
    if (bearish.length > 0) {
      const t = pick(bearish);
      return { symbol: t.symbol, trend: t };
    }
  }
  // Fallback: random tra tutti i coin attivi.
  const symbol = pick(allSymbols);
  const trend = trends.find((t) => t.symbol === symbol);
  return { symbol, trend };
}

/**
 * Risolvi i placeholder. Il trend ticker passato (se c'è) viene usato
 * per `{ticker_trend_7d}` / `{ticker_trend_30d}` con label umane IT.
 */
function resolveTemplate(
  template: string,
  pickedTicker: { symbol: string; trend: CoinTrend | undefined },
  coinNameMap: Record<string, string>,
  otherSeedUsernames: string[],
): string {
  const symbolToName = new Map<string, string>();
  for (const [name, sym] of Object.entries(coinNameMap)) {
    if (!symbolToName.has(sym)) {
      symbolToName.set(sym, name.charAt(0).toUpperCase() + name.slice(1));
    }
  }
  const tickerName = symbolToName.get(pickedTicker.symbol) ?? pickedTicker.symbol;

  return template
    .replace(/\{ticker\}/g, () => `$${pickedTicker.symbol}`)
    .replace(/\{ticker_name\}/g, () => tickerName)
    .replace(/\{ticker_trend_7d\}/g, () =>
      trendLabel(pickedTicker.trend?.change7d ?? null),
    )
    .replace(/\{ticker_trend_30d\}/g, () =>
      trendLabel(pickedTicker.trend?.change30d ?? null),
    )
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

  // Carica una sola volta: coin name map + trend analysis.
  const [coinNameMap, trends] = await Promise.all([
    getCoinNameMap(),
    analyzeCoinTrends(),
  ]);
  const allSymbols = Array.from(new Set(Object.values(coinNameMap)));

  const usernames = seedUsers.map((u) => u.username);
  const now = Date.now();
  const postWindowMs = 30 * 24 * 60 * 60 * 1000;

  type PendingPost = {
    id: string;
    authorId: string;
    body: string;
    visibility: "public" | "members";
    createdAt: Date;
    withImage: boolean;
  };
  const pending: PendingPost[] = [];

  // Track: ogni user ha al massimo 1 meta-post per non sembrare auto-promo.
  const metaPostUsed = new Set<string>();

  for (const user of seedUsers) {
    const otherUsernames = usernames.filter((u) => u !== user.username);
    const earliestPostMs = Math.max(
      user.createdAt.getTime(),
      now - postWindowMs,
    );
    const userWindowMs = now - earliestPostMs;

    for (let i = 0; i < opts.postsPerUser; i++) {
      // Decidi se è un meta-post (10% prob, max 1 per user).
      const isMetaPost =
        !metaPostUsed.has(user.id) &&
        Math.random() < META_POST_PROBABILITY;

      let template: string;
      if (isMetaPost) {
        template = pick(META_SITE_TEMPLATES_IT);
        metaPostUsed.add(user.id);
      } else {
        template = pickTemplateForMood(user.mood);
      }

      // Ticker pick mood-aware (anche se il template non lo usa,
      // resolveTemplate lo skippa gracefully).
      const pickedTicker = pickTickerForMood(user.mood, trends, allSymbols);
      const body = resolveTemplate(
        template,
        pickedTicker,
        coinNameMap,
        otherUsernames,
      );

      const visibility =
        Math.random() < 0.1 ? ("members" as const) : ("public" as const);
      const createdAt = new Date(
        earliestPostMs + Math.random() * userWindowMs,
      );
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

  // Bulk INSERT posts.
  await db.insert(posts).values(
    pending.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      body: p.body,
      visibility: p.visibility,
      createdAt: p.createdAt,
    })),
  );

  // Sync posts_tickers e posts_mentions.
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
  const allMentionUsernames = new Set<string>();
  const perPostMentions: Array<{
    postId: string;
    usernames: string[];
    createdAt: Date;
  }> = [];

  for (const p of pending) {
    const tickers = await extractTickers(p.body, coinNameMap);
    for (const t of tickers) {
      allTickerRows.push({ postId: p.id, ticker: t, createdAt: p.createdAt });
    }
    const mentions = extractMentions(p.body);
    const mentionsArr = Array.from(mentions);
    for (const m of mentionsArr) allMentionUsernames.add(m);
    if (mentionsArr.length > 0) {
      perPostMentions.push({
        postId: p.id,
        usernames: mentionsArr,
        createdAt: p.createdAt,
      });
    }
  }

  if (allTickerRows.length > 0) {
    await db.insert(postsTickers).values(allTickerRows).onConflictDoNothing();
  }

  if (perPostMentions.length > 0 && allMentionUsernames.size > 0) {
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

  // Media Picsum (deterministic seed).
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
