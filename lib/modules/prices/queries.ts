// lib/prices/queries.ts
// Query lato app per leggere prezzi e sparkline. Usate dai server components
// (Spark, CoinBadge, ticker) e dall'admin dashboard.
import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesData, pricesHistory, pricesSyncRuns } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** Tag per `revalidateTag()` quando si vogliono forzare le stats di health
 * fresche (es. al termine di un cron run). Senza revalidate la cache scade
 * comunque ogni 60s — accettabile dato che il cron sync gira ogni ~5 min. */
export const PRICES_HEALTH_TAG = "prices-health";

/** Tag per i dati prezzi user-facing (card coin, ticker, ecc). Invalidalo
 * a fine sync per propagare i nuovi prezzi senza aspettare il revalidate
 * 60s. */
export const PRICES_DATA_TAG = "prices-data";

export interface PriceRow {
  symbol: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
  source: string;
  lastUpdated: Date;
}

export async function getCurrentPrices(symbols: string[]): Promise<Map<string, PriceRow>> {
  if (symbols.length === 0) return new Map();
  const rows = await db.select().from(pricesData).where(inArray(pricesData.symbol, symbols));
  const map = new Map<string, PriceRow>();
  for (const r of rows) {
    map.set(r.symbol, {
      symbol: r.symbol,
      price: Number(r.price),
      change24h: r.change24h !== null ? Number(r.change24h) : null,
      volume24h: r.volume24h !== null ? Number(r.volume24h) : null,
      source: r.source,
      lastUpdated: r.lastUpdated,
    });
  }
  return map;
}

export async function getCurrentPrice(symbol: string): Promise<PriceRow | null> {
  const map = await getCurrentPrices([symbol]);
  return map.get(symbol) ?? null;
}

/**
 * Carica gli ultimi N punti per un simbolo (sparkline).
 * Restituisce array vuoto se non ci sono dati: il caller fa fallback alla
 * generazione procedurale (vedi components/shared/Spark.tsx).
 */
export async function getSparklinePoints(symbol: string, points = 24): Promise<number[]> {
  const rows = await db
    .select({ price: pricesHistory.price })
    .from(pricesHistory)
    .where(eq(pricesHistory.symbol, symbol))
    .orderBy(desc(pricesHistory.ts))
    .limit(points);

  // Reverse: vogliamo dal più vecchio al più recente per il rendering
  return rows.reverse().map((r) => Number(r.price));
}

/**
 * Variante batch: carica sparkline per molti simboli in una sola query.
 * Usata dal feed/ticker per evitare N+1.
 */
export async function getSparklinesBatch(
  symbols: string[],
  points = 24,
): Promise<Map<string, number[]>> {
  if (symbols.length === 0) return new Map();
  // IN (sql.join) invece di ANY(::text[]) — vedi commento gemello in
  // lib/notifications/generators/cron-failures.ts per il razionale.
  const symbolsInList = sql.join(
    symbols.map((s) => sql`${s}`),
    sql`, `,
  );
  // Window function per prendere gli ultimi N punti per simbolo in una query
  const rowsRaw = await db.execute<{ symbol: string; price: string; rn: number }>(sql`
    SELECT symbol, price::text AS price, rn
    FROM (
      SELECT
        symbol,
        price,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY ts DESC) AS rn
      FROM prices_history
      WHERE symbol IN (${symbolsInList})
    ) t
    WHERE rn <= ${points}
    ORDER BY symbol, rn DESC
  `);

  const map = new Map<string, number[]>();
  for (const r of rowsRaw) {
    const arr = map.get(r.symbol) ?? [];
    arr.push(Number(r.price));
    map.set(r.symbol, arr);
  }
  // Le righe arrivano già ordinate dal più vecchio al più recente grazie al
  // DESC interno + reverse logico (rn DESC).
  return map;
}

// ─────────────────────────────────────────────────────────────────────────
// Admin dashboard queries
// ─────────────────────────────────────────────────────────────────────────

export interface RecentRunStats {
  total: number;
  ok: number;
  errors: number;
  avgDurationMs: number | null;
  lastRunAt: Date | null;
}

/**
 * Stats run del cron prezzi (3 invocazioni dalla dashboard admin con kind
 * sync/snapshot/cleanup). Cache 60s con tag PRICES_HEALTH_TAG: il cron
 * gira ogni 5 min, quindi 60s di stale sono safe. unstable_cache usa gli
 * argomenti (kind, windowHours) per derivare la chiave automaticamente,
 * quindi le 3 chiamate hanno cache entry separate.
 */
const fetchRecentSyncStats = async (
  kind: "sync" | "snapshot" | "cleanup",
  windowHours = 24,
): Promise<RecentRunStats> => {
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
  const rows = await db
    .select()
    .from(pricesSyncRuns)
    .where(and(eq(pricesSyncRuns.kind, kind), gte(pricesSyncRuns.startedAt, cutoff)))
    .orderBy(desc(pricesSyncRuns.startedAt));

  if (rows.length === 0) {
    return { total: 0, ok: 0, errors: 0, avgDurationMs: null, lastRunAt: null };
  }

  let okCount = 0;
  let totalDuration = 0;
  let durationSamples = 0;

  for (const r of rows) {
    if (r.ok) okCount++;
    if (r.durationMs !== null) {
      totalDuration += r.durationMs;
      durationSamples++;
    }
  }

  return {
    total: rows.length,
    ok: okCount,
    errors: rows.length - okCount,
    avgDurationMs: durationSamples > 0 ? Math.round(totalDuration / durationSamples) : null,
    lastRunAt: rows[0].startedAt,
  };
};

const fetchRecentSyncStatsCached = unstable_cache(
  fetchRecentSyncStats,
  ["prices-recent-sync-stats"],
  { revalidate: 60, tags: [PRICES_HEALTH_TAG] },
);

export async function getRecentSyncStats(
  kind: "sync" | "snapshot" | "cleanup",
  windowHours = 24,
): Promise<RecentRunStats> {
  return fetchRecentSyncStatsCached(kind, windowHours);
}

const fetchRecentRuns = async (limit = 20) => {
  return await db
    .select()
    .from(pricesSyncRuns)
    .orderBy(desc(pricesSyncRuns.startedAt))
    .limit(limit);
};

const fetchRecentRunsCached = unstable_cache(
  fetchRecentRuns,
  ["prices-recent-runs"],
  { revalidate: 60, tags: [PRICES_HEALTH_TAG] },
);

export async function getRecentRuns(limit = 20) {
  return fetchRecentRunsCached(limit);
}

export async function listCoins() {
  return await db.select().from(pricesCoins).orderBy(desc(pricesCoins.marketCap));
}

// ─────────────────────────────────────────────────────────────────────────
// Coin cards (frontend)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Vista denormalizzata che alimenta le card coin del frontend: metadata
 * (nome, simbolo, icona) + prezzo live + variazione 24h + sparkline
 * settimanale pre-aggregata. Una sola riga = card pronta.
 */
export interface CoinView {
  symbol: string;
  name: string;
  imageUrl: string | null;
  marketCap: number | null;
  price: number;
  change24h: number | null;
  volume24h: number | null;
  /** 7 prezzi giornalieri oldest → newest. null se mai computata. */
  weeklySparkline: number[] | null;
  lastUpdated: Date;
}

/**
 * Top coin per market cap con prezzo + sparkline in 1 query.
 *
 * Cache 60s con tag `PRICES_DATA_TAG`: il sync cron CoinGecko propaga i
 * nuovi prezzi al massimo dopo 60s di stale (lui invaliderà il tag in
 * futuro, ora va a TTL).
 */
const fetchTopCoinsForCards = async (limit = 50): Promise<CoinView[]> => {
  const rows = await db
    .select({
      symbol: pricesCoins.symbol,
      name: pricesCoins.name,
      imageUrl: pricesCoins.imageUrl,
      marketCap: pricesCoins.marketCap,
      price: pricesData.price,
      change24h: pricesData.change24h,
      volume24h: pricesData.volume24h,
      weeklySparkline: pricesData.weeklySparkline,
      lastUpdated: pricesData.lastUpdated,
    })
    .from(pricesCoins)
    .innerJoin(pricesData, eq(pricesCoins.symbol, pricesData.symbol))
    .where(eq(pricesCoins.isActive, true))
    .orderBy(desc(pricesCoins.marketCap))
    .limit(limit);

  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    imageUrl: r.imageUrl,
    marketCap: r.marketCap,
    price: Number(r.price),
    change24h: r.change24h !== null ? Number(r.change24h) : null,
    volume24h: r.volume24h !== null ? Number(r.volume24h) : null,
    weeklySparkline: r.weeklySparkline,
    lastUpdated: r.lastUpdated,
  }));
};

const fetchTopCoinsForCardsCached = unstable_cache(
  fetchTopCoinsForCards,
  ["prices-top-coins-cards"],
  { revalidate: 60, tags: [PRICES_DATA_TAG] },
);

export async function getTopCoinsForCards(limit = 50): Promise<CoinView[]> {
  return fetchTopCoinsForCardsCached(limit);
}

/**
 * Singolo coin per la card (preview / hero / inline). Case-insensitive sul
 * simbolo. Restituisce null se il coin non esiste o non ha ancora un
 * prezzo registrato in `prices_data`. Cache 60s con tag PRICES_DATA_TAG.
 */
const fetchCoinForCard = async (symbol: string): Promise<CoinView | null> => {
  const upper = symbol.toUpperCase();
  const rows = await db
    .select({
      symbol: pricesCoins.symbol,
      name: pricesCoins.name,
      imageUrl: pricesCoins.imageUrl,
      marketCap: pricesCoins.marketCap,
      price: pricesData.price,
      change24h: pricesData.change24h,
      volume24h: pricesData.volume24h,
      weeklySparkline: pricesData.weeklySparkline,
      lastUpdated: pricesData.lastUpdated,
    })
    .from(pricesCoins)
    .innerJoin(pricesData, eq(pricesCoins.symbol, pricesData.symbol))
    .where(eq(pricesCoins.symbol, upper))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    symbol: r.symbol,
    name: r.name,
    imageUrl: r.imageUrl,
    marketCap: r.marketCap,
    price: Number(r.price),
    change24h: r.change24h !== null ? Number(r.change24h) : null,
    volume24h: r.volume24h !== null ? Number(r.volume24h) : null,
    weeklySparkline: r.weeklySparkline,
    lastUpdated: r.lastUpdated,
  };
};

const fetchCoinForCardCached = unstable_cache(
  fetchCoinForCard,
  ["prices-coin-for-card"],
  { revalidate: 60, tags: [PRICES_DATA_TAG] },
);

export async function getCoinForCard(symbol: string): Promise<CoinView | null> {
  return fetchCoinForCardCached(symbol);
}
