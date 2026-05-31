// lib/prices/queries.ts
// Query lato app per leggere prezzi e sparkline. Usate dai server components
// (Spark, CoinBadge, ticker) e dall'admin dashboard.
import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesHistory, pricesSyncRuns } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
  getHotPrices,
  getHotPricesForSymbols,
} from "./services/hot-prices";

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
  lastUpdated: Date;
}

export async function getCurrentPrices(symbols: string[]): Promise<Map<string, PriceRow>> {
  if (symbols.length === 0) return new Map();
  const hot = await getHotPricesForSymbols(symbols);
  const map = new Map<string, PriceRow>();
  for (const [sym, q] of hot) {
    map.set(sym, {
      symbol:    sym,
      price:     q.price,
      change24h: q.change24h,
      volume24h: q.volume24h,
      lastUpdated: new Date(),
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
  /** Posizione globale per market cap (1 = top). Null se mai popolato dal sync. */
  marketCapRank: number | null;
  category: string | null;
  price: number;
  change24h: number | null;
  volume24h: number | null;
  /** 21 punti settimanali oldest → newest (3/giorno). null se mai computata. */
  weeklySparkline: number[] | null;
  lastUpdated: Date;
}

/**
 * Pool top coin per market cap con prezzo + sparkline in 1 query.
 *
 * Cachato una volta solo (cap fisso TOP_POOL_SIZE), poi i consumer fanno
 * slice in memoria con `getTopCoinsForCards(limit)`. Così evitiamo entry di
 * cache separate per ogni `limit` distinto (home=4, esplora=20, lista=50,
 * ecc.). Cache 60s con tag `PRICES_DATA_TAG`.
 */
const TOP_POOL_SIZE = 200;

const fetchTopCoinsForCards = async (limit = TOP_POOL_SIZE): Promise<CoinView[]> => {
  // Metadata da DB (nome, immagine, rank, categoria) — raramente cambia.
  const coins = await db
    .select({
      symbol:       pricesCoins.symbol,
      name:         pricesCoins.name,
      imageUrl:     pricesCoins.imageUrl,
      marketCap:    pricesCoins.marketCap,
      marketCapRank: pricesCoins.marketCapRank,
      category:     pricesCoins.category,
      weeklySparkline: pricesCoins.weeklySparkline,
    })
    .from(pricesCoins)
    .where(eq(pricesCoins.isActive, true))
    // NULLS LAST: coin senza market cap in fondo, i big (BTC/ETH) in cima.
    .orderBy(sql`${pricesCoins.marketCap} DESC NULLS LAST`)
    .limit(limit);

  // Prezzi da Redis hot cache (1 GET, tutti i coin).
  const hot = await getHotPrices();
  const updatedAt = hot ? new Date(hot.updatedAt) : new Date();

  return coins
    .map((c) => {
      const q = hot?.quotes[c.symbol];
      if (!q) return null; // coin non ancora in Redis (cron non girato)
      return {
        symbol:        c.symbol,
        name:          c.name,
        imageUrl:      c.imageUrl,
        marketCap:     c.marketCap,
        marketCapRank: c.marketCapRank,
        category:      c.category,
        price:         q.price,
        change24h:     q.change24h,
        volume24h:     q.volume24h,
        weeklySparkline: c.weeklySparkline,
        lastUpdated:   updatedAt,
      };
    })
    .filter((c): c is CoinView => c !== null);
};

const fetchTopPoolCached = unstable_cache(
  () => fetchTopCoinsForCards(TOP_POOL_SIZE),
  ["prices-top-coins-pool"],
  { revalidate: 60, tags: [PRICES_DATA_TAG] },
);

export async function getTopCoinsForCards(limit = 50): Promise<CoinView[]> {
  const pool = await fetchTopPoolCached();
  if (limit >= pool.length) return pool;
  return pool.slice(0, limit);
}

/**
 * Singolo coin per la card (preview / hero / inline). Case-insensitive sul
 * simbolo. Restituisce null se il coin non esiste o non è ancora in Redis.
 * Cache 60s con tag PRICES_DATA_TAG.
 */
const fetchCoinForCard = async (symbol: string): Promise<CoinView | null> => {
  const upper = symbol.toUpperCase();
  const rows = await db
    .select({
      symbol:        pricesCoins.symbol,
      name:          pricesCoins.name,
      imageUrl:      pricesCoins.imageUrl,
      marketCap:     pricesCoins.marketCap,
      marketCapRank: pricesCoins.marketCapRank,
      category:      pricesCoins.category,
      weeklySparkline: pricesCoins.weeklySparkline,
    })
    .from(pricesCoins)
    .where(eq(pricesCoins.symbol, upper))
    .limit(1);

  const c = rows[0];
  if (!c) return null;

  const hot = await getHotPrices();
  const q = hot?.quotes[upper];
  if (!q) return null;

  return {
    symbol:        c.symbol,
    name:          c.name,
    imageUrl:      c.imageUrl,
    marketCap:     c.marketCap,
    marketCapRank: c.marketCapRank,
    category:      c.category,
    price:         q.price,
    change24h:     q.change24h,
    volume24h:     q.volume24h,
    weeklySparkline: c.weeklySparkline,
    lastUpdated:   hot ? new Date(hot.updatedAt) : new Date(),
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

// ─────────────────────────────────────────────────────────────────────────
// Coin name → symbol map (per parser ticker estesi nel modulo posts)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mappa `<nome lowercase> → <SYMBOL>` per il riconoscimento dei coin per
 * nome esteso ("bitcoin" → BTC, "solana" → SOL) nel parser del modulo
 * Posts.
 *
 * Implementazione: tokenization + Set/Map lookup. Lookup è O(1) per
 * parola, quindi parsare un post body è O(words_nel_body) **indipendente
 * dal numero di coin**. Scala lineare anche con 100k+ coin.
 *
 * Cache 5min via `unstable_cache`. Invalidata dal tag `PRICES_DATA_TAG`
 * quando admin aggiunge/disattiva/rinomina un coin → propagazione
 * immediata al parser senza aspettare il revalidate.
 *
 * Solo coin attivi (isActive=true). Solo single-word names (filtra
 * fuori "Bitcoin Cash" e simili — match multi-word richiede
 * tokenization più sofisticata, fuori scope v1).
 */
const fetchCoinNameMap = async (): Promise<Record<string, string>> => {
  const rows = await db
    .select({ symbol: pricesCoins.symbol, name: pricesCoins.name })
    .from(pricesCoins)
    .where(eq(pricesCoins.isActive, true));

  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!r.name) continue;
    const lower = r.name.toLowerCase().trim();
    // Skip multi-word names (es. "Bitcoin Cash"): in v1 matchiamo solo
    // single-word per evitare ambiguità su "Cash" / "Inu" / ecc.
    if (lower.includes(" ")) continue;
    // Skip se l'unica parola è troppo corta o uguale al symbol stesso
    // (es. "BTC" come name → già coperto dal parser $TICKER).
    if (lower.length < 3) continue;
    if (lower === r.symbol.toLowerCase()) continue;
    map[lower] = r.symbol;
  }
  return map;
};

const getCoinNameMapCached = unstable_cache(
  fetchCoinNameMap,
  ["prices-coin-name-map"],
  { revalidate: 300, tags: [PRICES_DATA_TAG] },
);

export async function getCoinNameMap(): Promise<Record<string, string>> {
  return getCoinNameMapCached();
}

// ─────────────────────────────────────────────────────────────────────────
// History series (chart interattivo)
// ─────────────────────────────────────────────────────────────────────────

export type HistoryRange = "1d" | "1w" | "1m" | "1y";

export interface HistoryPoint {
  /** Timestamp ms (più piccolo del Date object, friendly per Recharts). */
  ts: number;
  price: number;
}

export interface HistorySeries {
  range: HistoryRange;
  /** Da dove arrivano i punti: nostra DB o fallback CoinGecko. */
  source: "db" | "coingecko";
  points: HistoryPoint[];
}

/** Mappa finestra → giorni + granularità di bucket SQL.
 *  La granularità è scelta per produrre ~24–365 punti, abbastanza
 *  morbidi per Recharts senza appesantire la response. */
const RANGE_CONFIG: Record<
  HistoryRange,
  {
    days: number;
    bucket: "minute" | "hour" | "day";
    /** TTL cache server-side (s). 1d sta dietro al cron 5min. */
    revalidate: number;
  }
> = {
  "1d": { days: 1, bucket: "hour", revalidate: 60 },
  "1w": { days: 7, bucket: "hour", revalidate: 300 },
  "1m": { days: 30, bucket: "day", revalidate: 1800 },
  "1y": { days: 365, bucket: "day", revalidate: 3600 },
};

/**
 * Legge i punti dalla nostra `prices_history` con downsampling SQL
 * (close-price per bucket via DISTINCT ON). Ritorna sempre i punti
 * disponibili — il caller decide se sono sufficienti per la finestra.
 */
const fetchHistoryFromDb = async (
  symbol: string,
  range: HistoryRange,
): Promise<HistoryPoint[]> => {
  const { days, bucket } = RANGE_CONFIG[range];
  // toISOString(): db.execute() passa raw alla pg-js, che non binda Date
  // come timestamp (TypeError "Received an instance of Date"). Postgres
  // accetta la stringa ISO e la castiamo a timestamptz inline per
  // sicurezza tipi.
  const windowStartIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  // `bucket` deve essere inlined come literal SQL, NON come parametro
  // bindato: Postgres confronta le espressioni di DISTINCT ON e ORDER BY
  // testualmente — `date_trunc($1, ts)` e `date_trunc($5, ts)` sono
  // espressioni diverse anche se i parametri hanno lo stesso valore
  // ("SELECT DISTINCT ON expressions must match initial ORDER BY"
  // error 42P10). Bucket è una whitelist hard-coded di 3 valori, nessun
  // rischio injection.
  const bucketExpr = sql.raw(`date_trunc('${bucket}', ts)`);

  const rows = await db.execute<{ ts: string; price: string }>(sql`
    SELECT DISTINCT ON (${bucketExpr})
      ${bucketExpr}::text AS ts,
      price::text AS price
    FROM prices_history
    WHERE symbol = ${symbol}
      AND ts >= ${windowStartIso}::timestamptz
    ORDER BY ${bucketExpr} ASC, ts DESC
  `);

  return rows
    .map((r) => ({ ts: new Date(r.ts).getTime(), price: Number(r.price) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price));
};

/**
 * Restituisce il timestamp del primo punto disponibile per il symbol —
 * usato per decidere se la finestra richiesta è coperta dalla nostra DB
 * o se serve fallback CoinGecko.
 */
const fetchEarliestHistoryTsCached = unstable_cache(
  async (symbol: string): Promise<number | null> => {
    const rows = await db
      .select({ ts: pricesHistory.ts })
      .from(pricesHistory)
      .where(eq(pricesHistory.symbol, symbol))
      .orderBy(pricesHistory.ts)
      .limit(1);
    return rows[0]?.ts.getTime() ?? null;
  },
  ["prices-earliest-history-ts"],
  { revalidate: 300, tags: [PRICES_DATA_TAG] },
);

/**
 * Helper "ha abbastanza storia per coprire la finestra?": se l'inizio
 * della finestra richiesta è prima del primo punto in DB, fallback.
 * Margine di 10% per evitare flicker DB ↔ CoinGecko ai bordi.
 */
async function hasSufficientHistory(
  symbol: string,
  range: HistoryRange,
): Promise<boolean> {
  const earliest = await fetchEarliestHistoryTsCached(symbol);
  if (earliest === null) return false;
  const { days } = RANGE_CONFIG[range];
  const windowStart = Date.now() - days * 24 * 3600 * 1000;
  const margin = days * 24 * 3600 * 1000 * 0.1;
  return earliest <= windowStart + margin;
}

/**
 * Carica la serie storica per il chart interattivo.
 *
 * PR3 refactor (Redis-first): exchange-aware. Stessa logica della
 * route `/api/coins/[symbol]/chart` cosi' SSR + refetch client
 * mostrano gli stessi dati. Senza questa coerenza si vede un grafico
 * "vecchio" al first paint (da `prices_history` legacy) che cambia
 * al primo click utente — UX confusionaria.
 *
 *   1. Lookup `prices_coins.preferred_exchange + exchange_symbol`.
 *      Se presenti → fetch direct via adapter.fetchHistorical(). Stesso
 *      JSON shape, source marcato "coingecko" (legacy enum compat).
 *   2. Fallback DB: prova `prices_history` con downsampling SQL.
 *   3. Fallback CoinGecko `/coins/{id}/market_chart`.
 *   4. Ultimo fallback: torna quello che c'e' in DB (anche < 2 punti).
 */
const fetchHistorySeries = async (
  symbol: string,
  range: HistoryRange,
): Promise<HistorySeries> => {
  const upper = symbol.toUpperCase();

  // Step 1: exchange-aware (PR3) — stessa logica della route API.
  const [routingRow] = await db
    .select({
      preferredExchange: pricesCoins.preferredExchange,
      exchangeSymbol: pricesCoins.exchangeSymbol,
      coingeckoId: pricesCoins.coingeckoId,
    })
    .from(pricesCoins)
    .where(eq(pricesCoins.symbol, upper))
    .limit(1);

  if (routingRow?.preferredExchange && routingRow?.exchangeSymbol) {
    try {
      const { getExchangeAdapter } = await import("./exchanges/registry");
      const adapter = getExchangeAdapter(routingRow.preferredExchange);
      if (adapter) {
        // HistoryRange ha 1d|1w|1m|1y; l'adapter usa ChartRange (incluso
        // 3m/6m). Mappiamo 1-to-1 i 4 range comuni.
        const points = await adapter.fetchHistorical(
          routingRow.exchangeSymbol,
          range,
        );
        if (points.length >= 2) {
          return {
            range,
            // Source marcato "coingecko" perche' l'enum HistorySeries.source
            // non ha "exchange:<id>" yet. PR successivo estendera' l'enum.
            source: "coingecko",
            points: points.map((p) => ({ ts: p.ts, price: p.price })),
          };
        }
      }
    } catch (err) {
      console.warn(
        `[getHistorySeries] exchange ${routingRow.preferredExchange} failed for ${upper} ${range}`,
        err,
      );
      // Cade sui fallback sottostanti
    }
  }

  // Step 2: DB legacy (per coin senza routing oppure exchange down).
  const sufficient = await hasSufficientHistory(upper, range);
  if (sufficient) {
    const points = await fetchHistoryFromDb(upper, range);
    if (points.length >= 2) {
      return { range, source: "db", points };
    }
  }

  // Step 3: CoinGecko market_chart fallback.
  if (routingRow?.coingeckoId) {
    const { fetchCoinGeckoMarketChart } = await import(
      "./sources/coingecko"
    );
    const cgPoints = await fetchCoinGeckoMarketChart(
      routingRow.coingeckoId,
      RANGE_CONFIG[range].days,
    );
    if (cgPoints && cgPoints.length >= 2) {
      return {
        range,
        source: "coingecko",
        points: cgPoints.map((p) => ({ ts: p.ts.getTime(), price: p.price })),
      };
    }
  }

  // Step 4: ultimo resort = qualsiasi cosa ci sia in DB.
  const dbFallback = await fetchHistoryFromDb(upper, range);
  return { range, source: "db", points: dbFallback };
};

export async function getHistorySeries(
  symbol: string,
  range: HistoryRange,
): Promise<HistorySeries> {
  // Cache key derivata da (symbol, range). Drizzle/unstable_cache combina
  // gli argomenti nella chiave automaticamente. TTL dinamico per range.
  const cached = unstable_cache(
    () => fetchHistorySeries(symbol, range),
    ["prices-history-series", symbol.toUpperCase(), range],
    { revalidate: RANGE_CONFIG[range].revalidate, tags: [PRICES_DATA_TAG] },
  );
  return cached();
}

// ─────────────────────────────────────────────────────────────────────────
// Admin drill-down per coin singolo
// ─────────────────────────────────────────────────────────────────────────

export interface CoinHistoryStats {
  total: number;
  /** Quanti punti hanno il prezzo "tondo" (delta dal vecchio path
   *  snapshot copia-da-prices_data). Indicatore che serve un backfill. */
  rounded: number;
  firstTs: Date | null;
  lastTs: Date | null;
  /** Numero di "gap" (intervalli senza punti) >2× lo step medio. */
  gaps: number;
}

/**
 * Statistiche aggregate su `prices_history` per il symbol. Una sola
 * query, niente cache (questa pagina è admin-only).
 */
export async function getCoinHistoryStats(symbol: string): Promise<CoinHistoryStats> {
  const upper = symbol.toUpperCase();
  const rows = await db.execute<{
    total: string;
    rounded: string;
    first_ts: string | null;
    last_ts: string | null;
  }>(sql`
    SELECT
      COUNT(*)::text                                              AS total,
      COUNT(*) FILTER (WHERE price = trunc(price))::text          AS rounded,
      MIN(ts)::text                                               AS first_ts,
      MAX(ts)::text                                               AS last_ts
    FROM prices_history
    WHERE symbol = ${upper}
  `);
  const r = rows[0];
  if (!r) return { total: 0, rounded: 0, firstTs: null, lastTs: null, gaps: 0 };

  // Gap detection: distanze tra punti consecutivi, conta quanti
  // intervalli sono >2x lo step mediano. Cheap su qualche migliaio
  // di righe.
  const gapsRow = await db.execute<{ gaps: string }>(sql`
    WITH d AS (
      SELECT EXTRACT(EPOCH FROM (ts - LAG(ts) OVER (ORDER BY ts))) AS dt
      FROM prices_history
      WHERE symbol = ${upper}
    ),
    s AS (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dt) AS p50 FROM d WHERE dt IS NOT NULL)
    SELECT COUNT(*)::text AS gaps
    FROM d, s
    WHERE d.dt > s.p50 * 2
  `);
  const gaps = Number(gapsRow[0]?.gaps ?? 0);

  return {
    total: Number(r.total),
    rounded: Number(r.rounded),
    firstTs: r.first_ts ? new Date(r.first_ts) : null,
    lastTs: r.last_ts ? new Date(r.last_ts) : null,
    gaps: Number.isFinite(gaps) ? gaps : 0,
  };
}

export interface HistoryPageRow {
  id: number;
  ts: Date;
  price: number;
}

export interface HistoryPage {
  rows: HistoryPageRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Pagina di `prices_history` per il symbol, ordinata desc per ts.
 * `pageSize` clampato 10-200.
 */
export async function getCoinHistoryPage(
  symbol: string,
  page: number,
  pageSize: number,
): Promise<HistoryPage> {
  const upper = symbol.toUpperCase();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.max(10, Math.min(200, Math.trunc(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const [rowsRaw, countRow] = await Promise.all([
    db
      .select({
        id: pricesHistory.id,
        ts: pricesHistory.ts,
        price: pricesHistory.price,
      })
      .from(pricesHistory)
      .where(eq(pricesHistory.symbol, upper))
      .orderBy(desc(pricesHistory.ts))
      .limit(safePageSize)
      .offset(offset),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total
      FROM prices_history
      WHERE symbol = ${upper}
    `),
  ]);

  return {
    rows: rowsRaw.map((r) => ({
      id: r.id,
      ts: r.ts,
      price: Number(r.price),
    })),
    total: Number(countRow[0]?.total ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}
