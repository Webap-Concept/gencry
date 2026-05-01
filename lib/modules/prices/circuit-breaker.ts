// lib/prices/circuit-breaker.ts
// Circuit breaker DB-backed (tabella prices_source_health).
// Tre stati: closed (normale), open (skip source), half-open (un tentativo
// di prova; se ok torna closed, se ko torna open).
//
// Le transizioni sono guidate dai parametri configurati in app_settings:
//   - prices_breaker_max_err   : errori consecutivi prima di aprire
//   - prices_breaker_window_s  : entro la finestra (errori più vecchi di
//                                 questa finestra non contano)
//   - prices_breaker_open_s    : durata apertura (poi half-open)
import { db } from "@/lib/db/drizzle";
import { pricesSourceHealth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SourceName } from "./types";
import { getPricesConfig } from "./config";

export type BreakerStatus = "closed" | "open" | "half-open";

export interface BreakerState {
  source: SourceName;
  status: BreakerStatus;
  errorCount: number;
  successCount: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastSuccessAt: Date | null;
  openUntil: Date | null;
  avgLatencyMs: number | null;
}

async function readState(source: SourceName): Promise<BreakerState> {
  const rows = await db
    .select()
    .from(pricesSourceHealth)
    .where(eq(pricesSourceHealth.source, source))
    .limit(1);

  const row = rows[0];
  if (!row) {
    // Non dovrebbe accadere (la migration inserisce le righe), ma sii tollerante.
    return {
      source,
      status: "closed",
      errorCount: 0,
      successCount: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      openUntil: null,
      avgLatencyMs: null,
    };
  }
  return {
    source: row.source as SourceName,
    status: (row.status as BreakerStatus) ?? "closed",
    errorCount: row.errorCount,
    successCount: row.successCount,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastSuccessAt: row.lastSuccessAt,
    openUntil: row.openUntil,
    avgLatencyMs: row.avgLatencyMs,
  };
}

/**
 * Decide se la source può essere chiamata adesso.
 * - "closed": sì
 * - "open" con openUntil futuro: no
 * - "open" con openUntil passato: transiziona a "half-open" e permetti il try
 * - "half-open": sì (è il tentativo di prova)
 */
export async function canCall(source: SourceName): Promise<{ allowed: boolean; state: BreakerState }> {
  const state = await readState(source);
  if (state.status === "closed") return { allowed: true, state };
  if (state.status === "half-open") return { allowed: true, state };
  // open: controlla se è scaduto
  if (state.openUntil && state.openUntil.getTime() <= Date.now()) {
    await db
      .update(pricesSourceHealth)
      .set({ status: "half-open", updatedAt: new Date() })
      .where(eq(pricesSourceHealth.source, source));
    return { allowed: true, state: { ...state, status: "half-open" } };
  }
  return { allowed: false, state };
}

/**
 * Registra un successo: chiude il breaker (se era half-open o open scaduto)
 * e azzera il conteggio errori.
 */
export async function recordSuccess(source: SourceName, latencyMs: number): Promise<void> {
  const state = await readState(source);
  // Media mobile semplice (esponenziale-like): nuova = old*0.7 + new*0.3
  const prev = state.avgLatencyMs ?? latencyMs;
  const blended = Math.round(prev * 0.7 + latencyMs * 0.3);

  await db
    .update(pricesSourceHealth)
    .set({
      status: "closed",
      errorCount: 0,
      successCount: state.successCount + 1,
      lastSuccessAt: new Date(),
      openUntil: null,
      avgLatencyMs: blended,
      updatedAt: new Date(),
    })
    .where(eq(pricesSourceHealth.source, source));
}

/**
 * Registra un errore. Se gli errori superano la soglia entro la finestra
 * configurata, apre il breaker per la durata configurata.
 */
export async function recordError(source: SourceName, error: string): Promise<BreakerState> {
  const cfg = await getPricesConfig();
  const state = await readState(source);

  // Se l'ultimo errore è più vecchio della finestra, ricomincia il conteggio
  const now = Date.now();
  const windowMs = cfg.breakerWindowS * 1000;
  const isWithinWindow =
    state.lastErrorAt !== null && now - state.lastErrorAt.getTime() <= windowMs;

  const newErrorCount = isWithinWindow ? state.errorCount + 1 : 1;
  const shouldOpen = newErrorCount >= cfg.breakerMaxErr || state.status === "half-open";

  const updates: Partial<typeof pricesSourceHealth.$inferInsert> = {
    errorCount: newErrorCount,
    lastError: error.slice(0, 500),
    lastErrorAt: new Date(),
    updatedAt: new Date(),
  };

  if (shouldOpen) {
    updates.status = "open";
    updates.openUntil = new Date(now + cfg.breakerOpenS * 1000);
  }

  await db
    .update(pricesSourceHealth)
    .set(updates)
    .where(eq(pricesSourceHealth.source, source));

  return {
    ...state,
    errorCount: newErrorCount,
    lastError: error,
    lastErrorAt: new Date(),
    status: shouldOpen ? "open" : state.status,
    openUntil: shouldOpen ? new Date(now + cfg.breakerOpenS * 1000) : state.openUntil,
  };
}

export async function getAllBreakerStates(): Promise<BreakerState[]> {
  const rows = await db.select().from(pricesSourceHealth);
  return rows.map((row) => ({
    source: row.source as SourceName,
    status: (row.status as BreakerStatus) ?? "closed",
    errorCount: row.errorCount,
    successCount: row.successCount,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastSuccessAt: row.lastSuccessAt,
    openUntil: row.openUntil,
    avgLatencyMs: row.avgLatencyMs,
  }));
}
