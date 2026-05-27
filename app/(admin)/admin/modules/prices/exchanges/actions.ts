"use server";
// app/(admin)/admin/modules/prices/exchanges/actions.ts
//
// Server actions per la UI /admin/modules/prices/exchanges. Tutte gated
// dal section guard del modulo prices (admin:modules.prices), no extra
// permission necessaria (la gestione exchange e' parte del modulo).

import { db } from "@/lib/db/drizzle";
import { priceExchanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";
import { getExchangeAdapter } from "@/lib/modules/prices/exchanges/registry";
import type { HealthCheckResult } from "@/lib/modules/prices/exchanges/types";

const SECTION_PERM = "admin:users"; // PR4 placeholder; modulo prices
// non ha ancora una permission dedicata, usiamo admin:users come gate
// generico admin. Da spostare a `modules:prices` quando arrivera'.

export type ToggleResult =
  | { ok: true }
  | { ok: false; error: string };

export async function toggleExchangeEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ToggleResult> {
  await requireAdminSectionPage(SECTION_PERM);
  try {
    await db
      .update(priceExchanges)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export type SetApiKeyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setExchangeApiKeyAction(
  id: string,
  apiKey: string,
  apiSecret: string,
): Promise<SetApiKeyResult> {
  await requireAdminSectionPage(SECTION_PERM);
  try {
    await db
      .update(priceExchanges)
      .set({
        apiKey: apiKey.trim() || null,
        apiSecret: apiSecret.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export type HealthCheckActionResult =
  | { ok: true; latencyMs: number; status: "ok" | "fail"; error?: string }
  | { ok: false; error: string };

export type BulkAutoMapResult =
  | {
      ok: true;
      requestedTop: number;
      coinsEvaluated: number;
      notListedOnExchange: number;
      mapped: number;
      mappedSamples: string[];
    }
  | { ok: false; error: string };

/**
 * Auto-map dei top N coin (per market_cap_rank) sull'exchange dato.
 *
 *   1. Carica top N coin attivi del registry ordinati per
 *      market_cap_rank ASC NULLS LAST, escludendo i gia' mappati.
 *   2. 1 sola chiamata a `adapter.listSupportedUsdSymbols()` per il
 *      set di pair USDT effettivi sull'exchange.
 *   3. Per ogni candidato, costruisce `<SYM>USDT` e fa match. Coin
 *      matched → UPDATE; not listed → skip.
 *
 * Idempotente. Sicuro re-eseguire (i mappati sono filtrati out).
 */
export async function bulkAutoMapAction(
  exchangeId: string,
  topN: number,
): Promise<BulkAutoMapResult> {
  await requireAdminSectionPage(SECTION_PERM);

  const n = Math.min(Math.max(Math.trunc(topN || 0), 1), 5000);
  const adapter = getExchangeAdapter(exchangeId);
  if (!adapter) {
    return { ok: false, error: `Adapter '${exchangeId}' non implementato.` };
  }
  if (!adapter.listSupportedUsdSymbols) {
    return {
      ok: false,
      error: `Adapter '${exchangeId}' non supporta il bulk auto-map.`,
    };
  }

  const { pricesCoins } = await import("@/lib/db/schema");
  const { asc, and, isNull, sql } = await import("drizzle-orm");
  const candidates = await db
    .select({ symbol: pricesCoins.symbol })
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        isNull(pricesCoins.preferredExchange),
      ),
    )
    .orderBy(
      sql`${pricesCoins.marketCapRank} ASC NULLS LAST`,
      asc(pricesCoins.symbol),
    )
    .limit(n);

  let supported: Set<string>;
  try {
    supported = await adapter.listSupportedUsdSymbols();
  } catch (err) {
    return {
      ok: false,
      error: `Lista symbol exchange fallita: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }

  const toUpdate: { symbol: string; exchangeSymbol: string }[] = [];
  let notListed = 0;
  // Symbol per-exchange: Binance "BTCUSDT", KuCoin "BTC-USDT", Gate
  // "BTC_USDT". Fallback Binance-style se l'adapter non override.
  const buildSym = adapter.buildUsdSymbol
    ? adapter.buildUsdSymbol.bind(adapter)
    : (s: string) => `${s.toUpperCase()}USDT`;
  for (const c of candidates) {
    const exchSym = buildSym(c.symbol);
    if (supported.has(exchSym.toUpperCase())) {
      toUpdate.push({ symbol: c.symbol, exchangeSymbol: exchSym });
    } else {
      notListed++;
    }
  }

  if (toUpdate.length > 0) {
    const now = new Date();
    // Loop UPDATE: N <= 1000 → ~5-15s totale serializzato (Drizzle non
    // ha bulk UPDATE FROM VALUES fluent senza raw SQL). Trascurabile per
    // un'operazione admin one-shot.
    for (const u of toUpdate) {
      await db
        .update(pricesCoins)
        .set({
          preferredExchange: exchangeId,
          exchangeSymbol: u.exchangeSymbol,
          updatedAt: now,
        })
        .where(eq(pricesCoins.symbol, u.symbol));
    }
  }

  revalidatePath("/admin/modules/prices/exchanges");
  revalidatePath("/admin/modules/prices/coins");

  return {
    ok: true,
    requestedTop: n,
    coinsEvaluated: candidates.length,
    notListedOnExchange: notListed,
    mapped: toUpdate.length,
    mappedSamples: toUpdate.slice(0, 10).map((u) => u.symbol),
  };
}

/**
 * Esegue health check live + persiste il risultato in
 * price_exchanges.last_health_*. Cosi' la lista mostra sempre lo
 * snapshot piu' recente senza dover hit l'API ogni page load.
 */
export async function healthCheckExchangeAction(
  id: string,
): Promise<HealthCheckActionResult> {
  await requireAdminSectionPage(SECTION_PERM);
  const adapter = getExchangeAdapter(id);
  if (!adapter) {
    return { ok: false, error: "Adapter non implementato in codice." };
  }
  let result: HealthCheckResult;
  try {
    result = await adapter.healthCheck();
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    await db
      .update(priceExchanges)
      .set({
        lastHealthCheck: new Date(),
        lastHealthOk: false,
        lastHealthError: error,
        updatedAt: new Date(),
      })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: false, error };
  }

  await db
    .update(priceExchanges)
    .set({
      lastHealthCheck: new Date(),
      lastHealthOk: result.ok,
      lastHealthError: result.ok ? null : result.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(priceExchanges.id, id));
  revalidatePath("/admin/modules/prices/exchanges");
  return {
    ok: true,
    latencyMs: result.latencyMs,
    status: result.ok ? "ok" : "fail",
    error: result.error,
  };
}
