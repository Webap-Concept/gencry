// lib/prices/sync.ts
// Orchestrazione del cron-sync: raccolta active universe, chiamata source
// primaria (CoinGecko), fallback su DexScreener via circuit breaker, upsert
// in `prices_data` con delta threshold, log run su `prices_sync_runs`.
import { db } from "@/lib/db/drizzle";
import { pricesCoins, pricesData, pricesHistory, pricesSyncRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getActiveUniverse, type ActiveCoin } from "./active-universe";
import { canCall, recordError, recordSuccess } from "./circuit-breaker";
import { getPricesConfig } from "./config";
import { CoinGeckoError, fetchCoinGeckoPrices } from "./sources/coingecko";
import { DexScreenerError, fetchDexScreenerPrices } from "./sources/dexscreener";
import { getExchangeAdapter } from "./exchanges/registry";
import {
  ExchangeAdapterError,
  type ExchangeFetchInput,
} from "./exchanges/types";
import { setHotPrices } from "./services/hot-prices";
import type { PriceQuote } from "./types";

export interface SyncResult {
  ok: boolean;
  coinsTotal: number;
  coinsUpdated: number;
  sourceUsed: "coingecko" | "dexscreener" | "mixed" | null;
  durationMs: number;
  error?: string;
}

/**
 * Esegui un ciclo di sync prezzi correnti.
 * - Tenta CoinGecko se il breaker è chiuso
 * - In caso di errore (o coin mancanti), tenta DexScreener per i mancanti
 * - Upsert in `prices` solo se il delta supera la soglia configurata
 * - Logga il run in `prices_sync_runs`
 */
export async function runPricesSync(force = false): Promise<SyncResult> {
  const started = new Date();
  const startMs = Date.now();
  const cfg = await getPricesConfig();

  // Honor configured cadence: la cron Vercel batte fisso (vedi vercel.json),
  // questo early-exit permette all'admin di "rallentare" il sync senza
  // redeploy. `force=true` dal trigger manuale dell'admin bypassa il check.
  if (!force) {
    const last = await db
      .select({ startedAt: pricesSyncRuns.startedAt })
      .from(pricesSyncRuns)
      .where(and(eq(pricesSyncRuns.kind, "sync"), eq(pricesSyncRuns.ok, true)))
      .orderBy(desc(pricesSyncRuns.startedAt))
      .limit(1);
    if (last[0]) {
      // Grace 30s per non saltare un tick borderline
      const minIntervalMs = cfg.cronMinutes * 60_000 - 30_000;
      const elapsed = Date.now() - last[0].startedAt.getTime();
      if (elapsed < minIntervalMs) {
        return {
          ok: true,
          coinsTotal: 0,
          coinsUpdated: 0,
          sourceUsed: null,
          durationMs: 0,
        };
      }
    }
  }

  const universe = await getActiveUniverse();
  if (universe.length === 0) {
    const result = await logRun({
      kind: "sync",
      startedAt: started,
      durationMs: Date.now() - startMs,
      coinsTotal: 0,
      coinsUpdated: 0,
      sourceUsed: null,
      ok: true,
    });
    return { ...result, ok: true };
  }

  const collected = new Map<string, PriceQuote>();
  let sourceUsed: SyncResult["sourceUsed"] = null;
  let lastError: string | undefined;

  // ── 1) Group-by-exchange routing (PR2 refactor Redis-first) ──────────
  // Ogni coin con `preferred_exchange + exchange_symbol` viene routato al
  // suo adapter. I coin senza mapping ricadono sul vecchio path CoinGecko.
  // Failure isolation per-exchange: se Binance e' down, gli altri (e
  // CoinGecko per i tail) continuano.
  const exchangeGroups = groupByExchange(universe);
  let exchangePathUsed = false;
  for (const [exchangeId, inputs] of exchangeGroups) {
    const adapter = getExchangeAdapter(exchangeId);
    if (!adapter || inputs.length === 0) continue;
    try {
      const map = await adapter.fetchCurrentPrices(inputs);
      for (const [sym, q] of map) collected.set(sym, q);
      exchangePathUsed = true;
    } catch (err) {
      const msg =
        err instanceof ExchangeAdapterError
          ? err.message
          : err instanceof Error
            ? err.message
            : `${exchangeId} fetch failed`;
      console.error(`[runPricesSync] exchange ${exchangeId} failed:`, err);
      lastError = msg;
      // Niente fallback automatico ad altro exchange per gli inputs di
      // questo gruppo: i coin restano "missing" e li tenta CoinGecko.
    }
  }

  // ── 2) CoinGecko per i coin SENZA exchange routing o ancora mancanti ─
  // Backward compatibility: tutti i coin con coingeckoId che non sono stati
  // gia' raccolti dagli exchanges → CoinGecko come oggi.
  const cgIdToSymbol = new Map<string, string>();
  for (const c of universe) {
    if (c.coingeckoId && !collected.has(c.symbol)) {
      cgIdToSymbol.set(c.coingeckoId, c.symbol);
    }
  }

  if (cgIdToSymbol.size > 0) {
    const allowed = await canCall("coingecko");
    if (allowed.allowed) {
      try {
        const result = await fetchCoinGeckoPrices(cgIdToSymbol);
        for (const [sym, q] of result.quotes) collected.set(sym, q);
        await recordSuccess("coingecko", result.latencyMs);
        sourceUsed = exchangePathUsed ? "mixed" : "coingecko";
      } catch (err) {
        const msg =
          err instanceof CoinGeckoError ? err.message : err instanceof Error ? err.message : "unknown";
        await recordError("coingecko", msg);
        lastError = msg;
      }
    }
  } else if (exchangePathUsed) {
    // Tutto coperto dagli exchange, niente CoinGecko richiesto.
    sourceUsed = "mixed";
  }

  // ── 3) Fallback: DexScreener (per coin mancanti dopo entrambi) ───────
  const missing = universe.filter((c) => !collected.has(c.symbol));
  if (missing.length > 0) {
    const allowed = await canCall("dexscreener");
    if (allowed.allowed) {
      try {
        const result = await fetchDexScreenerPrices(missing.map((c) => c.symbol));
        for (const [sym, q] of result.quotes) collected.set(sym, q);
        await recordSuccess("dexscreener", result.latencyMs);
        sourceUsed =
          sourceUsed === "coingecko" || sourceUsed === "mixed"
            ? "mixed"
            : "dexscreener";
      } catch (err) {
        const msg =
          err instanceof DexScreenerError ? err.message : err instanceof Error ? err.message : "unknown";
        await recordError("dexscreener", msg);
        lastError = lastError ?? msg;
      }
    }
  }

  // ── 3) Upsert con delta threshold ────────────────────────────────────
  // La sparkline 7gg viene salvata dentro l'upsert quando la quote arriva
  // da CoinGecko (`/coins/markets?sparkline=true`). DexScreener non la
  // fornisce: per quei coin la sparkline resta al valore precedente.
  //
  // Try/catch CRITICO: se l'upsert fallisce (es. colonna mancante per
  // migration non applicata), senza questo wrapper recordSuccess sarebbe
  // già stato chiamato sul source ma logRun NON verrebbe mai eseguito —
  // risultato: "Last success" recente, "Recent runs" vecchio di ore,
  // niente errore visibile.
  let updated = 0;
  let upsertError: string | undefined;
  try {
    updated = await upsertPrices(Array.from(collected.values()), cfg.deltaThreshold);
  } catch (err) {
    upsertError = err instanceof Error ? err.message : "upsert failed";
    console.error("[runPricesSync] upsertPrices failed:", err);
  }

  // ── 3.5) Dual-write Redis hot layer (PR2 refactor) ──────────────────
  // Scriviamo SEMPRE su Redis l'intero snapshot collected (TTL 90s). I
  // consumer in PR2c leggeranno preferibilmente da qui; durante la
  // transition `prices_data` resta il cold fallback DB. Best-effort:
  // errori loggati ma non interrompono il run (Redis down → l'app cade
  // automaticamente su prices_data).
  if (collected.size > 0) {
    try {
      const res = await setHotPrices(collected);
      if (!res.ok) {
        console.warn("[runPricesSync] hot-prices write skipped (Redis not configured or down)");
      }
    } catch (err) {
      console.error("[runPricesSync] setHotPrices failed:", err);
    }
  }

  // ── 4) Aggiorna master-data su prices_coins (market_cap, rank) ──────
  // Best-effort: errori qui non degradano il run, gli update mancati
  // verranno recuperati al prossimo tick.
  try {
    await syncMasterData(Array.from(collected.values()));
  } catch (err) {
    console.error("[runPricesSync] syncMasterData failed:", err);
  }

  // ── 5) Snapshot in prices_history (best-effort, gated da snapshotMinutes) ──
  // Scriviamo qui con il prezzo FRESCO appena raccolto, NON copiando da
  // prices_data: quest'ultima resta "settled" col delta threshold e darebbe
  // linee piatte nel chart. Gate `snapshotMinutes` evita scritture ogni
  // sync run quando l'admin vuole granularità più lassa (es. 30/60 min).
  try {
    await writeSnapshotIfDue(
      Array.from(collected.values()),
      cfg.snapshotMinutes,
      started,
    );
  } catch (err) {
    console.error("[runPricesSync] writeSnapshotIfDue failed:", err);
  }

  const ok = !upsertError && (collected.size > 0 || universe.length === 0);
  const durationMs = Date.now() - startMs;
  const errorMessage = upsertError ?? (ok ? undefined : lastError);

  await logRun({
    kind: "sync",
    startedAt: started,
    durationMs,
    coinsTotal: universe.length,
    coinsUpdated: updated,
    sourceUsed,
    ok,
    error: errorMessage,
  });

  return {
    ok,
    coinsTotal: universe.length,
    coinsUpdated: updated,
    sourceUsed,
    durationMs,
    error: ok ? undefined : lastError,
  };
}

/**
 * Upsert intelligente: aggiorna solo i coin il cui prezzo è cambiato di
 * almeno `delta` rispetto al valore corrente (riduce churn su Realtime).
 *
 * Batched: i quote da scrivere sono raccolti in 2 sotto-array e committati
 * in 2 INSERT bulk con ON CONFLICT DO UPDATE — invece di 1 query per coin
 * come faceva la versione legacy (audit egress 2026-05-25: ~850K calls/mese
 * al pooler solo da questo loop).
 *
 *   - `withSparkline`: quote con sparkline fresca → upsert sovrascrive
 *     anche `weekly_sparkline` + `weekly_sparkline_at`.
 *   - `coreOnly`: quote senza sparkline (es. DexScreener) → upsert aggiorna
 *     SOLO price/change24h/volume24h/last_updated, lasciando intatti
 *     i campi sparkline esistenti (niente cancellazione accidentale).
 *
 * Il pre-filter delta resta identico al comportamento precedente: skip se
 * la differenza relativa è sotto la soglia E non abbiamo nuova sparkline.
 *
 * NB: l'`excluded` pseudo-table di Postgres referenzia i valori dell'INSERT
 * conflittuale — è il modo canonico di "usa quello che ho appena provato a
 * inserire" dentro un ON CONFLICT DO UPDATE bulk. Drizzle accetta `sql\`...\``
 * come valore in `set` per esprimerlo.
 */
async function upsertPrices(quotes: PriceQuote[], delta: number): Promise<number> {
  if (quotes.length === 0) return 0;

  // Carica i prezzi correnti di questi simboli in una singola query
  const symbols = quotes.map((q) => q.symbol);
  const existingRows = await db
    .select({ symbol: pricesData.symbol, price: pricesData.price })
    .from(pricesData)
    .where(inArray(pricesData.symbol, symbols));

  const existing = new Map<string, number>();
  for (const r of existingRows) existing.set(r.symbol, Number(r.price));

  const now = new Date();
  type CoreRow = {
    symbol: string;
    price: string;
    change24h: string | null;
    volume24h: string | null;
    source: string;
    lastUpdated: Date;
  };
  type SparklineRow = CoreRow & {
    weeklySparkline: number[];
    weeklySparklineAt: Date;
  };
  const withSparkline: SparklineRow[] = [];
  const coreOnly: CoreRow[] = [];

  for (const q of quotes) {
    const hasSparkline = q.sparkline7d !== null && q.sparkline7d.length >= 2;

    // Delta threshold: skippa l'update solo se NON abbiamo nuova sparkline da
    // scrivere. Se la quote viene da CoinGecko (sparkline fresca), scriviamo
    // sempre per non perdere il refresh decorativo.
    if (!hasSparkline) {
      const prev = existing.get(q.symbol);
      if (prev !== undefined) {
        const diff = Math.abs(q.price - prev) / Math.max(prev, 1e-12);
        if (diff < delta) continue;
      }
    }

    const core: CoreRow = {
      symbol: q.symbol,
      price: String(q.price),
      change24h: q.change24h !== null ? String(q.change24h) : null,
      volume24h: q.volume24h !== null ? String(q.volume24h) : null,
      source: "coingecko",
      lastUpdated: now,
    };
    if (hasSparkline) {
      withSparkline.push({
        ...core,
        weeklySparkline: q.sparkline7d as number[],
        weeklySparklineAt: now,
      });
    } else {
      coreOnly.push(core);
    }
  }

  // ── Batch 1: rows con sparkline fresca (sovrascrive anche weekly_*) ──
  if (withSparkline.length > 0) {
    await db
      .insert(pricesData)
      .values(withSparkline)
      .onConflictDoUpdate({
        target: pricesData.symbol,
        set: {
          price:             sql`excluded.price`,
          change24h:         sql`excluded.change_24h`,
          volume24h:         sql`excluded.volume_24h`,
          source:            sql`excluded.source`,
          lastUpdated:       sql`excluded.last_updated`,
          weeklySparkline:   sql`excluded.weekly_sparkline`,
          weeklySparklineAt: sql`excluded.weekly_sparkline_at`,
        },
      });
  }

  // ── Batch 2: rows SENZA sparkline (preserva weekly_* esistenti) ──
  // Importante: weekly_sparkline / weekly_sparkline_at NON nel set →
  // i campi esistenti restano intatti su ON CONFLICT. Per gli INSERT
  // first-time (no row precedente), defaults DB li imposterà a NULL —
  // accettabile, la prossima sync con sparkline li popolerà.
  if (coreOnly.length > 0) {
    await db
      .insert(pricesData)
      .values(coreOnly)
      .onConflictDoUpdate({
        target: pricesData.symbol,
        set: {
          price:       sql`excluded.price`,
          change24h:   sql`excluded.change_24h`,
          volume24h:   sql`excluded.volume_24h`,
          source:      sql`excluded.source`,
          lastUpdated: sql`excluded.last_updated`,
        },
      });
  }

  return withSparkline.length + coreOnly.length;
}

/**
 * Aggiorna i campi master-data su `prices_coins` (market_cap, market_cap_rank)
 * dai quote raccolti. Eseguito in una singola UPDATE FROM VALUES per evitare
 * N round-trip DB. Vengono toccati SOLO i coin di cui abbiamo dati nuovi
 * (CoinGecko popola entrambi i campi; DexScreener no → skippati).
 */
async function syncMasterData(quotes: PriceQuote[]): Promise<void> {
  const rows = quotes.filter(
    (q) => q.marketCap !== null || q.marketCapRank !== null,
  );
  if (rows.length === 0) return;

  // Costruiamo una VALUES list (symbol, market_cap, market_cap_rank) e
  // facciamo un singolo UPDATE FROM. Drizzle non ha helper diretto per
  // VALUES → usiamo sql template.
  const values = sql.join(
    rows.map(
      (q) => sql`(
        ${q.symbol},
        ${q.marketCap}::bigint,
        ${q.marketCapRank}::integer
      )`,
    ),
    sql`, `,
  );

  await db.execute(sql`
    UPDATE prices_coins AS c
    SET
      market_cap      = COALESCE(v.market_cap, c.market_cap),
      market_cap_rank = COALESCE(v.market_cap_rank, c.market_cap_rank),
      updated_at      = NOW()
    FROM (VALUES ${values}) AS v(symbol, market_cap, market_cap_rank)
    WHERE c.symbol = v.symbol
  `);
}

/**
 * Scrive un punto in `prices_history` per ogni coin che ha un prezzo nuovo
 * dai quotes raccolti dal sync. Gated da `snapshotMinutes`: skippa la
 * scrittura se l'ultimo snapshot run è < snapshotMinutes - grace fa.
 *
 * Sostituisce il vecchio cron snapshot separato che copiava da prices_data
 * (causa "linea piatta" quando il delta threshold skippava l'upsert).
 */
async function writeSnapshotIfDue(
  quotes: PriceQuote[],
  snapshotMinutes: number,
  nowDate: Date,
): Promise<void> {
  if (quotes.length === 0) return;

  // Check ultimo run snapshot. Grace di 30s per non saltare un tick
  // borderline. NB: filtriamo solo per kind, NON anche per ok=true: se
  // l'ultimo tentativo è fallito non vogliamo riproporre subito un
  // INSERT identico in loop infinito — meglio aspettare il prossimo
  // intervallo regolare. La riga di errore resta visibile nella Health
  // dashboard per la diagnosi.
  const last = await db
    .select({ startedAt: pricesSyncRuns.startedAt })
    .from(pricesSyncRuns)
    .where(eq(pricesSyncRuns.kind, "snapshot"))
    .orderBy(desc(pricesSyncRuns.startedAt))
    .limit(1);
  if (last[0]) {
    const minIntervalMs = snapshotMinutes * 60_000 - 30_000;
    const elapsed = Date.now() - last[0].startedAt.getTime();
    if (elapsed < minIntervalMs) return;
  }

  const validQuotes = quotes.filter((q) => Number.isFinite(q.price));
  if (validQuotes.length === 0) return;

  // Insert + log: SE l'insert fallisce, registriamo comunque un run
  // kind=snapshot con ok=false e l'errore così la Health dashboard
  // mostra una riga rossa invece di un silent swallow.
  try {
    await db.insert(pricesHistory).values(
      validQuotes.map((q) => ({
        symbol: q.symbol,
        ts: nowDate,
        price: String(q.price),
      })),
    );
    await logRun({
      kind: "snapshot",
      startedAt: nowDate,
      durationMs: Date.now() - nowDate.getTime(),
      coinsTotal: validQuotes.length,
      coinsUpdated: validQuotes.length,
      sourceUsed: null,
      ok: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "snapshot insert failed";
    console.error("[writeSnapshotIfDue] INSERT failed:", err);
    await logRun({
      kind: "snapshot",
      startedAt: nowDate,
      durationMs: Date.now() - nowDate.getTime(),
      coinsTotal: validQuotes.length,
      coinsUpdated: 0,
      sourceUsed: null,
      ok: false,
      error: message,
    });
    throw err; // propaga così il try/catch del caller logga + swallow
  }
}

/**
 * Snapshot timeseries — entry point legacy del cron snapshot dedicato.
 *
 * La scrittura di `prices_history` ora avviene INSIDE `runPricesSync` con
 * i quotes freschi raccolti da CoinGecko (vedi `writeSnapshotIfDue`), per
 * evitare il bug "linea piatta": il vecchio path copiava da `prices_data`
 * che resta "settled" con `delta_threshold`, scrivendo lo stesso prezzo a
 * ogni tick. Manteniamo l'endpoint come no-op per non rompere il cron
 * registrato finché non viene rimosso dal manifest/vercel.json.
 */
export async function runPricesSnapshot(): Promise<SyncResult> {
  return {
    ok: true,
    coinsTotal: 0,
    coinsUpdated: 0,
    sourceUsed: null,
    durationMs: 0,
  };
}

/**
 * Cleanup: cancella punti di `prices_history` più vecchi della retention.
 */
export async function runPricesCleanup(): Promise<SyncResult> {
  const started = new Date();
  const startMs = Date.now();
  const cfg = await getPricesConfig();
  const cutoff = new Date(Date.now() - cfg.retentionDays * 24 * 3600 * 1000);

  const deleted = await db
    .delete(pricesHistory)
    .where(lt(pricesHistory.ts, cutoff))
    .returning({ id: pricesHistory.id });

  const durationMs = Date.now() - startMs;
  await logRun({
    kind: "cleanup",
    startedAt: started,
    durationMs,
    coinsTotal: 0,
    coinsUpdated: deleted.length,
    sourceUsed: null,
    ok: true,
  });

  return {
    ok: true,
    coinsTotal: 0,
    coinsUpdated: deleted.length,
    sourceUsed: null,
    durationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Exchange routing helper (PR2 refactor)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Raggruppa i coin attivi per `preferred_exchange`. I coin senza
 * mapping exchange (preferred_exchange = null) NON entrano nella mappa
 * — verranno fetchati da CoinGecko nel branch successivo del cron.
 *
 * Output: Map<exchangeId, ExchangeFetchInput[]> con symbol canonico
 * + exchange_symbol pronto da passare ad adapter.fetchCurrentPrices.
 */
function groupByExchange(
  universe: ActiveCoin[],
): Map<string, ExchangeFetchInput[]> {
  const groups = new Map<string, ExchangeFetchInput[]>();
  for (const c of universe) {
    if (!c.preferredExchange || !c.exchangeSymbol) continue;
    const arr = groups.get(c.preferredExchange) ?? [];
    arr.push({ symbol: c.symbol, exchangeSymbol: c.exchangeSymbol });
    groups.set(c.preferredExchange, arr);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────
// Logging helper
// ─────────────────────────────────────────────────────────────────────────

interface LogPayload {
  kind: "sync" | "snapshot" | "cleanup";
  startedAt: Date;
  durationMs: number;
  coinsTotal: number;
  coinsUpdated: number;
  sourceUsed: SyncResult["sourceUsed"];
  ok: boolean;
  error?: string;
}

async function logRun(p: LogPayload): Promise<SyncResult> {
  await db.insert(pricesSyncRuns).values({
    kind: p.kind,
    startedAt: p.startedAt,
    finishedAt: new Date(),
    durationMs: p.durationMs,
    coinsTotal: p.coinsTotal,
    coinsUpdated: p.coinsUpdated,
    sourceUsed: p.sourceUsed,
    ok: p.ok,
    error: p.error ?? null,
  });

  return {
    ok: p.ok,
    coinsTotal: p.coinsTotal,
    coinsUpdated: p.coinsUpdated,
    sourceUsed: p.sourceUsed,
    durationMs: p.durationMs,
    error: p.error,
  };
}

