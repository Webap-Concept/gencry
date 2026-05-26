// lib/modules/seeders/contributors/posts-contributor.ts
//
// Crea post variati per ogni seed user via Claude LLM batched per giorno.
//
// Pipeline (refactor 2026-05-26):
//   1. Pre-pass: per ogni (user, post) decido createdAt + mood + type
//      + tickerFocus, SENZA generare il body.
//   2. Raggruppo i pending per giorno (YYYY-MM-DD del createdAt).
//   3. Per ogni giorno: market snapshot at-time + 1 call Claude batched.
//   4. Map output LLM al body del pending tramite refId.
//   5. Bulk INSERT posts + tickers + mentions + media (come V1).
//
// Type mix (deciso 2026-05-26):
//   - 10% meta_site (max 1 per user, mai negativo)
//   - poi degli altri:
//     - ~65% market    (con ticker focus mood-coerente)
//     - ~28% personal  (vita/riflessione, niente ticker)
//     - ~ 7% question  (domanda alla community)
//
// Strict mode: se Claude API key manca o la call fallisce, l'intero
// contributor THROW. Niente fallback templates (decisione utente: i seed
// devono essere realistici o non essere).
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
import { MOOD_TREND_PREFERENCE, type UserMood } from "../services/mood-types";
import {
  analyzeCoinTrends,
  type CoinTrend,
} from "../services/price-trend-analyzer";
import {
  generatePostBodiesForDay,
  type LlmPostRequest,
  type PostType,
} from "../services/llm-content-generator";
import { getMarketSnapshotAtDate } from "../services/market-context";
import type { SeedUser } from "../services/user-seeder";

const META_POST_PROBABILITY = 0.1;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Symbol pick coerente col mood. Se il mood richiede bullish/bearish
 * e ci sono coin nel bucket richiesto, peschiamo da li'. Altrimenti
 * fallback a qualsiasi coin attivo.
 *
 * Il trend e' calcolato sul "now" (non sul timestamp del post): e'
 * un'euristica per scegliere il symbol piu' "interessante" da
 * passare al LLM come tickerFocus — il modello poi vedra' il market
 * snapshot at-time per decidere cosa dire effettivamente.
 */
function pickTickerForMood(
  mood: UserMood,
  trends: CoinTrend[],
  allSymbols: string[],
): string {
  const pref = MOOD_TREND_PREFERENCE[mood];
  if (pref === "bullish") {
    const bullish = trends.filter((t) => t.bucket === "bullish");
    if (bullish.length > 0) return pick(bullish).symbol;
  } else if (pref === "bearish") {
    const bearish = trends.filter((t) => t.bucket === "bearish");
    if (bearish.length > 0) return pick(bearish).symbol;
  }
  return pick(allSymbols);
}

/**
 * Decide il type del post DOPO che meta_site e' stato eventualmente
 * pickato. Distribuzione 65/28/7 = market / personal / question.
 */
function pickNonMetaType(): "market" | "personal" | "question" {
  const r = Math.random();
  if (r < 0.65) return "market";
  if (r < 0.93) return "personal";
  return "question";
}

/**
 * Formatta una Date come "YYYY-MM-DD" UTC. Usata come bucket key per
 * raggruppare i pending in batch-per-giorno.
 */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type SeedPostsOptions = {
  postsPerUser: number;
  withImages: boolean;
};

export type SeededPosts = {
  created: number;
  /** ID dei post inseriti — passati al reactions-contributor per
   *  generare reazioni sui post appena creati. */
  postIds: string[];
};

export async function seedPostsForUsers(
  seedUsers: SeedUser[],
  opts: SeedPostsOptions,
): Promise<SeededPosts> {
  if (seedUsers.length === 0 || opts.postsPerUser <= 0) {
    return { created: 0, postIds: [] };
  }

  // Carica una sola volta: coin name map + trend analysis.
  // Il trend e' usato SOLO per scegliere quale ticker passare a Claude
  // come "focus", non per scrivere il body — quello arriva dal market
  // snapshot at-time visto da Claude.
  const [coinNameMap, trends] = await Promise.all([
    getCoinNameMap(),
    analyzeCoinTrends(),
  ]);
  const allSymbols = Array.from(new Set(Object.values(coinNameMap)));

  const now = Date.now();
  const postWindowMs = 30 * 24 * 60 * 60 * 1000;

  type PendingPost = {
    id: string;
    authorId: string;
    authorUsername: string;
    mood: UserMood;
    type: PostType;
    tickerFocus: string | null;
    visibility: "public" | "members";
    createdAt: Date;
    withImage: boolean;
    /** Popolato dopo la batch LLM call. */
    body: string;
  };
  const pending: PendingPost[] = [];

  const metaPostUsed = new Set<string>();

  for (const user of seedUsers) {
    const earliestPostMs = Math.max(
      user.createdAt.getTime(),
      now - postWindowMs,
    );
    const userWindowMs = now - earliestPostMs;

    for (let i = 0; i < opts.postsPerUser; i++) {
      const isMetaPost =
        !metaPostUsed.has(user.id) &&
        Math.random() < META_POST_PROBABILITY;

      let type: PostType;
      let tickerFocus: string | null;

      if (isMetaPost) {
        metaPostUsed.add(user.id);
        type = "meta_site";
        tickerFocus = null;
      } else {
        type = pickNonMetaType();
        tickerFocus =
          type === "market" ? pickTickerForMood(user.mood, trends, allSymbols) : null;
      }

      const visibility =
        Math.random() < 0.1 ? ("members" as const) : ("public" as const);
      const createdAt = new Date(
        earliestPostMs + Math.random() * userWindowMs,
      );
      const withImage = opts.withImages && Math.random() < 0.3;

      pending.push({
        id: randomUUID(),
        authorId: user.id,
        authorUsername: user.username,
        mood: user.mood,
        type,
        tickerFocus,
        visibility,
        createdAt,
        withImage,
        body: "", // popolato dopo Claude batch
      });
    }
  }

  if (pending.length === 0) return { created: 0, postIds: [] };

  // ─────────────────────────────────────────────────────────────────────
  // LLM batch generation per giorno.
  //
  // Raggruppo i pending per dayKey (createdAt UTC YYYY-MM-DD). Per ogni
  // gruppo: 1 market snapshot at-time + 1 call Claude. Strict: se UNA
  // call fallisce, fail-fast (no parziale insert).
  // ─────────────────────────────────────────────────────────────────────
  const byDay = new Map<string, PendingPost[]>();
  for (const p of pending) {
    const key = dayKey(p.createdAt);
    const arr = byDay.get(key) ?? [];
    arr.push(p);
    byDay.set(key, arr);
  }

  for (const [day, group] of byDay) {
    // Centro temporale del gruppo (per market snapshot piu' coerente
    // della media): pick il timestamp mediano del gruppo.
    const sorted = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const midpoint = sorted[Math.floor(sorted.length / 2)].createdAt;
    const snapshot = await getMarketSnapshotAtDate(midpoint);

    const requests: LlmPostRequest[] = group.map((p) => ({
      refId: p.id,
      mood: p.mood,
      type: p.type,
      tickerFocus: p.tickerFocus,
      authorUsername: p.authorUsername,
    }));

    const generated = await generatePostBodiesForDay({
      requests,
      marketSnapshot: snapshot,
      dayLabel: day,
    });

    // Map output → pending body via refId.
    const byRefId = new Map(generated.map((g) => [g.refId, g.body]));
    for (const p of group) {
      const body = byRefId.get(p.id);
      if (!body) {
        // generatePostBodiesForDay garantisce coverage, ma defensive:
        // se per qualche bug arriva qui, fail-fast.
        throw new Error(
          `[seeders/posts-contributor] missing body for refId=${p.id} in day=${day}`,
        );
      }
      p.body = body;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Bulk INSERT posts.
  // ─────────────────────────────────────────────────────────────────────
  await db.insert(posts).values(
    pending.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      body: p.body,
      visibility: p.visibility,
      createdAt: p.createdAt,
    })),
  );

  // Sync posts_tickers e posts_mentions a partire dai body generati.
  const allTickerRows: Array<{ postId: string; ticker: string; createdAt: Date }> = [];
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
    const allMentionRows: Array<{
      postId: string;
      mentionedUserId: string;
      createdAt: Date;
    }> = [];
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

  // Media Picsum (deterministic seed) — invariato V1.
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

  return {
    created: pending.length,
    postIds: pending.map((p) => p.id),
  };
}
