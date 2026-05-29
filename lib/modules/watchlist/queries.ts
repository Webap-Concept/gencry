import "server-only";
// lib/modules/watchlist/queries.ts
//
// Server reads del modulo watchlist. 3 entry-point:
//
//   - getMyWatchlists(userId)        → lista per /watchlist
//   - getMyWatchlistById(uid, id)    → detail mia /watchlist/[id]
//   - getPublicWatchlistByUserSlug() → detail pubblica /w/<u>/<slug>
//
// Pattern fan-out controllato (memoria feedback_db_pool_caution):
//   1. SELECT watchlists (filtrato)
//   2. SELECT watchlist_coins WHERE wl_id IN (...)
//   3. resolve coin view: prima dal top-pool (1 cache hit shareable),
//      poi `getCoinForCard` per quelle non-pool (parallel + per-call cache)
//   4. MGET Redis perf 30g — `getCoinsPerf30d`
//   5. assembla summary/detail
//
// Niente fan-out N+1 nel render: i widget UI ricevono dati gia' pronti.

import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db/drizzle";
import {
  userProfiles,
  watchlistCoins,
  watchlists,
} from "@/lib/db/schema";
import {
  getCoinForCard,
  getTopCoinsForCards,
} from "@/lib/modules/prices/queries";
import type { CoinView } from "@/lib/modules/prices/queries";
import { averagePerf, getCoinsPerf30d } from "./perf-cache";
import type {
  WatchlistCoinSummary,
  WatchlistDetail,
  WatchlistSummary,
  WatchlistVisibility,
} from "./types";

// Cap render-side dei top coin per card della lista (preview).
const TOP_COINS_PREVIEW = 3;

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Resolve N symbols → CoinView map. Symbol presenti nel pool top-200
 * vengono serviti da li' (1 cache shared per tutti); i restanti vanno
 * a `getCoinForCard` (parallel, per-symbol cache 60s).
 *
 * Symbol non risolti (coin disattivata o mai sync'd) finiscono come
 * stub minimale per non rompere il render — la UI mostra "—" sui campi
 * mancanti.
 */
async function resolveCoinViews(
  symbols: string[],
): Promise<Map<string, CoinView | null>> {
  if (symbols.length === 0) return new Map();
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const pool = await getTopCoinsForCards(200);
  const poolMap = new Map<string, CoinView>();
  for (const c of pool) poolMap.set(c.symbol, c);

  const result = new Map<string, CoinView | null>();
  const missing: string[] = [];
  for (const s of unique) {
    const fromPool = poolMap.get(s);
    if (fromPool) {
      result.set(s, fromPool);
    } else {
      missing.push(s);
    }
  }
  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map((s) => getCoinForCard(s)));
    for (let i = 0; i < missing.length; i++) {
      result.set(missing[i], fetched[i]);
    }
  }
  return result;
}

function toCoinSummary(
  symbol: string,
  position: number,
  view: CoinView | null,
): WatchlistCoinSummary {
  return {
    symbol,
    name: view?.name ?? symbol,
    imageUrl: view?.imageUrl ?? null,
    price: view?.price ?? 0,
    change24h: view?.change24h ?? null,
    position,
  };
}

function assertVisibility(v: string): WatchlistVisibility {
  return v === "public" ? "public" : "private";
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Lista delle watchlist proprie. Ordinate per (position, created_at).
 * Solo ATTIVE (archived_at IS NULL). Cap a `max_per_user_*` ma noi
 * ritorniamo TUTTE — la UI si occupa di mostrarle.
 *
 * Render-target: pagina /watchlist (loggato).
 */
export async function getMyWatchlists(
  userId: string,
): Promise<WatchlistSummary[]> {
  // 1. Lista watchlist proprie active.
  const rows = await db
    .select()
    .from(watchlists)
    .where(
      and(eq(watchlists.userId, userId), isNull(watchlists.archivedAt)),
    )
    .orderBy(asc(watchlists.position), asc(watchlists.createdAt));
  if (rows.length === 0) return [];

  // 2. Coins batch per tutte le wl.
  const wlIds = rows.map((r) => r.id);
  const coinRows = await db
    .select()
    .from(watchlistCoins)
    .where(inArray(watchlistCoins.watchlistId, wlIds))
    .orderBy(asc(watchlistCoins.position), asc(watchlistCoins.addedAt));

  // 3. Resolve coin views + perf 30g batch (sui symbol unici totali).
  const allSymbols = coinRows.map((c) => c.symbol);
  const [coinViews, perfMap] = await Promise.all([
    resolveCoinViews(allSymbols),
    getCoinsPerf30d(allSymbols),
  ]);

  // 4. Group coins per watchlist + assembla summary.
  const coinsByWl = new Map<string, typeof coinRows>();
  for (const c of coinRows) {
    const arr = coinsByWl.get(c.watchlistId);
    if (arr) arr.push(c);
    else coinsByWl.set(c.watchlistId, [c]);
  }

  return rows.map((w) => {
    const wlCoins = coinsByWl.get(w.id) ?? [];
    const wlSymbols = wlCoins.map((c) => c.symbol);
    const topCoins = wlCoins
      .slice(0, TOP_COINS_PREVIEW)
      .map((c) => toCoinSummary(c.symbol, c.position, coinViews.get(c.symbol) ?? null));
    const perf30dPct = averagePerf(wlSymbols, perfMap);
    return {
      id: w.id,
      userId: w.userId,
      name: w.name,
      slug: w.slug,
      description: w.description,
      visibility: assertVisibility(w.visibility),
      position: w.position,
      coinsCount: w.coinsCount,
      followersCount: w.followersCount,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      topCoins,
      perf30dPct,
    };
  });
}

/**
 * Detail della watchlist propria. Ownership check inline: ritorna null
 * se non esiste o non appartiene al viewer. La pagina chiama notFound()
 * sul null (404 indistinguibile da "non e' tua" per non leakare info).
 */
export async function getMyWatchlistById(
  userId: string,
  watchlistId: string,
): Promise<WatchlistDetail | null> {
  const rows = await db
    .select({
      w: watchlists,
      ownerUsername: userProfiles.username,
    })
    .from(watchlists)
    .leftJoin(userProfiles, eq(userProfiles.userId, watchlists.userId))
    .where(
      and(
        eq(watchlists.id, watchlistId),
        eq(watchlists.userId, userId),
        isNull(watchlists.archivedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  return assembleDetail(row.w, row.ownerUsername ?? "");
}

/**
 * Detail pubblica via (username, slug). Anche per anon — la rotta
 * /w/<username>/<slug> e' SEO-public. Ritorna null se la watchlist non
 * esiste, e' private o owner senza profilo (caso edge).
 */
export async function getPublicWatchlistByUserSlug(
  username: string,
  slug: string,
): Promise<WatchlistDetail | null> {
  const rows = await db
    .select({
      w: watchlists,
      ownerUsername: userProfiles.username,
    })
    .from(watchlists)
    .innerJoin(userProfiles, eq(userProfiles.userId, watchlists.userId))
    .where(
      and(
        eq(userProfiles.username, username),
        eq(watchlists.slug, slug),
        eq(watchlists.visibility, "public"),
        isNull(watchlists.archivedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return assembleDetail(row.w, row.ownerUsername ?? username);
}

// ─── Overview stats (card riepilogativa /watchlist) ───────────────────

export interface WatchlistOverviewStats {
  watchlistsCount: number;
  uniqueCoinsCount: number;
  /** Coin aggiunte negli ultimi 30 giorni (sommatoria su tutte le wl). */
  addedLast30dCount: number;
  /** Perf 30g media pesata per coinsCount. Null se nessuna perf
   *  disponibile o nessuna coin tracked. */
  weightedPerf30dPct: number | null;
  /** Coin con il |change24h| massimo tra tutte quelle nelle wl. */
  topMover24h: {
    symbol: string;
    name: string;
    imageUrl: string | null;
    change24hPct: number;
  } | null;
  /** Max `lastUpdated` delle coin nella lista (proxy "ultima sincro"). */
  lastSyncAt: Date | null;
}

/**
 * Stats riepilogo per la card overview sopra il grid /watchlist.
 * Riceve la lista gia' caricata da `getMyWatchlists` per evitare un
 * fan-out duplicato sui prezzi/perf. Solo 1 query SQL extra: count
 * coin aggiunte negli ultimi 30 gg (per il "+N questo mese").
 */
export async function getWatchlistOverviewStats(
  userId: string,
  watchlists: WatchlistSummary[],
): Promise<WatchlistOverviewStats> {
  if (watchlists.length === 0) {
    return {
      watchlistsCount: 0,
      uniqueCoinsCount: 0,
      addedLast30dCount: 0,
      weightedPerf30dPct: null,
      topMover24h: null,
      lastSyncAt: null,
    };
  }

  // Coin uniche: estraiamo dai topCoins di ogni wl. Per la card V1 i
  // topCoins coprono SOLO il preview (3 per wl), quindi caricheremmo
  // sotto-stima. Carichiamo invece i symbol completi via watchlist_coins
  // batch — 1 query, gia' indicizzata.
  const wlIds = watchlists.map((w) => w.id);
  const allCoinRows = await db
    .select({
      watchlistId: watchlistCoins.watchlistId,
      symbol: watchlistCoins.symbol,
      addedAt: watchlistCoins.addedAt,
    })
    .from(watchlistCoins)
    .where(inArray(watchlistCoins.watchlistId, wlIds));

  const allSymbols = new Set<string>();
  let addedLast30d = 0;
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  for (const row of allCoinRows) {
    allSymbols.add(row.symbol);
    if (row.addedAt && new Date(row.addedAt).getTime() >= cutoff) {
      addedLast30d++;
    }
  }

  // Perf 30g media pesata per coinsCount. Esclude le wl senza perf.
  let totalWeight = 0;
  let weightedSum = 0;
  for (const w of watchlists) {
    if (w.perf30dPct === null || !Number.isFinite(w.perf30dPct)) continue;
    if (w.coinsCount <= 0) continue;
    totalWeight += w.coinsCount;
    weightedSum += w.perf30dPct * w.coinsCount;
  }
  const weightedPerf30dPct =
    totalWeight > 0 ? weightedSum / totalWeight : null;

  // Top mover 24h: risolvo le coin uniche e prendo il max |change24h|.
  // Riusa il pool top200 + per-symbol fallback (cache shared).
  const coinViews = await resolveCoinViews(Array.from(allSymbols));
  let topMover: WatchlistOverviewStats["topMover24h"] = null;
  let bestAbs = -Infinity;
  let lastSync: Date | null = null;
  for (const v of coinViews.values()) {
    if (!v) continue;
    if (v.lastUpdated) {
      const tNow = new Date(v.lastUpdated).getTime();
      if (!lastSync || tNow > lastSync.getTime()) lastSync = new Date(tNow);
    }
    if (v.change24h === null || !Number.isFinite(v.change24h)) continue;
    const a = Math.abs(v.change24h);
    if (a > bestAbs) {
      bestAbs = a;
      topMover = {
        symbol: v.symbol,
        name: v.name,
        imageUrl: v.imageUrl,
        change24hPct: v.change24h,
      };
    }
  }

  return {
    watchlistsCount: watchlists.length,
    uniqueCoinsCount: allSymbols.size,
    addedLast30dCount: addedLast30d,
    weightedPerf30dPct,
    topMover24h: topMover,
    lastSyncAt: lastSync,
  };
}

// ─── Reverse lookup: in quante watchlist e' una coin ──────────────────
//
// Conta TUTTE le watchlist attive (public + private) che contengono il
// symbol — segnale di popolarita' aggregato e anonimo (non si rivela
// MAI chi). La PK (watchlist_id, symbol) garantisce 1 riga per watchlist,
// quindi count(righe) = count(watchlist distinte). Indicizzata da
// idx_watchlist_coins_symbol.
//
// React.cache: dedup per-request (la coin page la usa una volta, ma il
// wrapper protegge da fan-out futuri). La staleness e' coperta dall'ISR
// 60s della coin page.

export const getWatchlistCountForSymbol = cache(
  async (symbol: string): Promise<number> => {
    const upper = symbol.toUpperCase();
    const rows = await db
      .select({ n: count() })
      .from(watchlistCoins)
      .innerJoin(watchlists, eq(watchlists.id, watchlistCoins.watchlistId))
      .where(
        and(
          eq(watchlistCoins.symbol, upper),
          isNull(watchlists.archivedAt),
        ),
      );
    return rows[0]?.n ?? 0;
  },
);

/**
 * Membership delle MIE watchlist rispetto a un symbol: lista delle mie
 * watchlist attive + flag `hasCoin`. Per il popover "Aggiungi a
 * watchlist" della coin page. Non cached (per-user, dev'essere fresh
 * dopo un toggle).
 */
export interface WatchlistMembershipRow {
  id: string;
  name: string;
  visibility: WatchlistVisibility;
  coinsCount: number;
  hasCoin: boolean;
}

export async function getMyWatchlistsForSymbol(
  userId: string,
  symbol: string,
): Promise<WatchlistMembershipRow[]> {
  const upper = symbol.toUpperCase();
  const rows = await db
    .select({
      id: watchlists.id,
      name: watchlists.name,
      visibility: watchlists.visibility,
      coinsCount: watchlists.coinsCount,
      hasCoin: watchlistCoins.watchlistId,
    })
    .from(watchlists)
    .leftJoin(
      watchlistCoins,
      and(
        eq(watchlistCoins.watchlistId, watchlists.id),
        eq(watchlistCoins.symbol, upper),
      ),
    )
    .where(and(eq(watchlists.userId, userId), isNull(watchlists.archivedAt)))
    .orderBy(asc(watchlists.position), asc(watchlists.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    visibility: assertVisibility(r.visibility),
    coinsCount: r.coinsCount,
    hasCoin: r.hasCoin !== null,
  }));
}

// ─── Detail assembler ──────────────────────────────────────────────────

async function assembleDetail(
  w: typeof watchlists.$inferSelect,
  ownerUsername: string,
): Promise<WatchlistDetail> {
  const wlCoins = await db
    .select()
    .from(watchlistCoins)
    .where(eq(watchlistCoins.watchlistId, w.id))
    .orderBy(asc(watchlistCoins.position), asc(watchlistCoins.addedAt));

  const symbols = wlCoins.map((c) => c.symbol);
  const [coinViews, perfMap] = await Promise.all([
    resolveCoinViews(symbols),
    getCoinsPerf30d(symbols),
  ]);

  const coins = wlCoins.map((c) =>
    toCoinSummary(c.symbol, c.position, coinViews.get(c.symbol) ?? null),
  );
  const topCoins = coins.slice(0, TOP_COINS_PREVIEW);
  const perf30dPct = averagePerf(symbols, perfMap);

  return {
    id: w.id,
    userId: w.userId,
    name: w.name,
    slug: w.slug,
    description: w.description,
    visibility: assertVisibility(w.visibility),
    position: w.position,
    coinsCount: w.coinsCount,
    followersCount: w.followersCount,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    topCoins,
    coins,
    perf30dPct,
    ownerUsername,
  };
}
