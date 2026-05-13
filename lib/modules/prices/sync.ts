// lib/prices/sync.ts
// Orchestrazione del cron-sync: raccolta active universe, chiamata source
// primaria (CoinGecko), fallback su DexScreener via circuit breaker, upsert
// in `prices_data` con delta threshold, log run su `prices_sync_runs`.
import { db } from "@/lib/db/drizzle";
import { pricesData, pricesHistory, pricesSyncRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { getActiveUniverse } from "./active-universe";
import { canCall, recordError, recordSuccess } from "./circuit-breaker";
import { getPricesConfig } from "./config";
import { CoinGeckoError, fetchCoinGeckoPrices } from "./sources/coingecko";
import { DexScreenerError, fetchDexScreenerPrices } from "./sources/dexscreener";
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

  // ── 1) Primary: CoinGecko ────────────────────────────────────────────
  const cgIdToSymbol = new Map<string, string>();
  for (const c of universe) {
    if (c.coingeckoId) cgIdToSymbol.set(c.coingeckoId, c.symbol);
  }

  if (cgIdToSymbol.size > 0) {
    const allowed = await canCall("coingecko");
    if (allowed.allowed) {
      try {
        const result = await fetchCoinGeckoPrices(cgIdToSymbol);
        for (const [sym, q] of result.quotes) collected.set(sym, q);
        await recordSuccess("coingecko", result.latencyMs);
        sourceUsed = "coingecko";
      } catch (err) {
        const msg =
          err instanceof CoinGeckoError ? err.message : err instanceof Error ? err.message : "unknown";
        await recordError("coingecko", msg);
        lastError = msg;
      }
    }
  }

  // ── 2) Fallback: DexScreener (per coin mancanti dopo CoinGecko) ──────
  const missing = universe.filter((c) => !collected.has(c.symbol));
  if (missing.length > 0) {
    const allowed = await canCall("dexscreener");
    if (allowed.allowed) {
      try {
        const result = await fetchDexScreenerPrices(missing.map((c) => c.symbol));
        for (const [sym, q] of result.quotes) collected.set(sym, q);
        await recordSuccess("dexscreener", result.latencyMs);
        sourceUsed = sourceUsed === "coingecko" ? "mixed" : "dexscreener";
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
  const updated = await upsertPrices(Array.from(collected.values()), cfg.deltaThreshold);

  const ok = collected.size > 0 || universe.length === 0;
  const durationMs = Date.now() - startMs;

  await logRun({
    kind: "sync",
    startedAt: started,
    durationMs,
    coinsTotal: universe.length,
    coinsUpdated: updated,
    sourceUsed,
    ok,
    error: ok ? undefined : lastError,
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

  let updatedCount = 0;
  const now = new Date();

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

    const sparklineSet = hasSparkline
      ? { weeklySparkline: q.sparkline7d, weeklySparklineAt: now }
      : {};

    await db
      .insert(pricesData)
      .values({
        symbol: q.symbol,
        price: String(q.price),
        change24h: q.change24h !== null ? String(q.change24h) : null,
        volume24h: q.volume24h !== null ? String(q.volume24h) : null,
        source: "coingecko",
        lastUpdated: now,
        ...sparklineSet,
      })
      .onConflictDoUpdate({
        target: pricesData.symbol,
        set: {
          price: String(q.price),
          change24h: q.change24h !== null ? String(q.change24h) : null,
          volume24h: q.volume24h !== null ? String(q.volume24h) : null,
          lastUpdated: now,
          ...sparklineSet,
        },
      });
    updatedCount++;
  }

  return updatedCount;
}

/**
 * Snapshot timeseries: scrive un punto in `prices_history` per ogni coin che
 * ha un prezzo corrente. Chiamato dal cron snapshot (default ogni 5 min).
 */
export async function runPricesSnapshot(force = false): Promise<SyncResult> {
  const started = new Date();
  const startMs = Date.now();
  const cfg = await getPricesConfig();

  if (!force) {
    const last = await db
      .select({ startedAt: pricesSyncRuns.startedAt })
      .from(pricesSyncRuns)
      .where(and(eq(pricesSyncRuns.kind, "snapshot"), eq(pricesSyncRuns.ok, true)))
      .orderBy(desc(pricesSyncRuns.startedAt))
      .limit(1);
    if (last[0]) {
      const minIntervalMs = cfg.snapshotMinutes * 60_000 - 30_000;
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

  const rows = await db
    .select({ symbol: pricesData.symbol, price: pricesData.price })
    .from(pricesData);

  if (rows.length === 0) {
    const r = {
      kind: "snapshot" as const,
      startedAt: started,
      durationMs: Date.now() - startMs,
      coinsTotal: 0,
      coinsUpdated: 0,
      sourceUsed: null,
      ok: true,
    };
    await logRun(r);
    return { ok: true, coinsTotal: 0, coinsUpdated: 0, sourceUsed: null, durationMs: r.durationMs };
  }

  const now = new Date();
  await db.insert(pricesHistory).values(
    rows.map((r) => ({
      symbol: r.symbol,
      ts: now,
      price: r.price,
    })),
  );

  const durationMs = Date.now() - startMs;
  await logRun({
    kind: "snapshot",
    startedAt: started,
    durationMs,
    coinsTotal: rows.length,
    coinsUpdated: rows.length,
    sourceUsed: null,
    ok: true,
  });

  return { ok: true, coinsTotal: rows.length, coinsUpdated: rows.length, sourceUsed: null, durationMs };
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

