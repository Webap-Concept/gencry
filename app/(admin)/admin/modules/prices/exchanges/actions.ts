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

const SECTION_PERM = "modules:prices";

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

export type ImportExchangeCoinsResult =
  | {
      ok: true;
      marketsFromExchange: number;
      skippedLowVolume: number;
      skippedExisting: number;
      inserted: number;
      insertedSamples: string[];
    }
  | { ok: false; error: string };

/**
 * Import "wholesale" dei coin da un exchange. A differenza del bulk
 * auto-map (che parte dal nostro registry e routa), questo parte dal
 * catalogo dell'exchange e POPOLA il registry. Pensato per partire
 * con un universo coin grande senza dipendere da CoinGecko.
 *
 *   1. adapter.listSupportedUsdMarkets() → tutti i pair USDT attivi
 *      con volume24h (in USDT ≈ USD).
 *   2. Filter `volume24h >= minVolume24h` per scartare scam/dust.
 *   3. Per ogni market sopravvissuto: INSERT in `prices_coins` con
 *      name=symbol, image_url=null, is_active=true,
 *      preferred_exchange=<id>, exchange_symbol=<exchangeSymbol>.
 *      ON CONFLICT (symbol) DO NOTHING → skip esistenti.
 *
 * I metadata "estetici" (name leggibile, image, market_cap_rank,
 * sparkline7d, coingecko_id) sono lasciati al successivo enrichment
 * via CoinGecko (action separata).
 */
export async function importExchangeCoinsAction(
  exchangeId: string,
  minVolume24h: number,
): Promise<ImportExchangeCoinsResult> {
  await requireAdminSectionPage(SECTION_PERM);

  const adapter = getExchangeAdapter(exchangeId);
  if (!adapter) {
    return { ok: false, error: `Adapter '${exchangeId}' non implementato.` };
  }
  if (!adapter.listSupportedUsdMarkets) {
    return {
      ok: false,
      error: `Adapter '${exchangeId}' non supporta l'import wholesale.`,
    };
  }
  const minVol = Math.max(0, Math.trunc(minVolume24h || 0));

  let markets: Array<{
    exchangeSymbol: string;
    canonicalSymbol: string;
    volume24h: number;
  }>;
  try {
    markets = await adapter.listSupportedUsdMarkets();
  } catch (err) {
    return {
      ok: false,
      error: `Lista markets exchange fallita: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }

  let skippedLowVolume = 0;
  const candidates: typeof markets = [];
  for (const m of markets) {
    if (m.volume24h < minVol) {
      skippedLowVolume++;
    } else {
      candidates.push(m);
    }
  }

  // De-dup per canonicalSymbol: se sullo stesso exchange ci sono piu'
  // pair che mappano allo stesso base (es. token wrapped), tieni
  // quello con volume piu' alto.
  const byCanonical = new Map<
    string,
    { exchangeSymbol: string; canonicalSymbol: string; volume24h: number }
  >();
  for (const m of candidates) {
    const cur = byCanonical.get(m.canonicalSymbol);
    if (!cur || m.volume24h > cur.volume24h) byCanonical.set(m.canonicalSymbol, m);
  }

  const { pricesCoins } = await import("@/lib/db/schema");
  const now = new Date();
  let inserted = 0;
  const insertedSymbols: string[] = [];

  for (const m of byCanonical.values()) {
    const sym = m.canonicalSymbol.toUpperCase();
    // INSERT ... ON CONFLICT DO NOTHING. Drizzle non ritorna `affected`
    // di default; usiamo `returning` per contare le righe insertate.
    const ins = await db
      .insert(pricesCoins)
      .values({
        symbol: sym,
        name: sym, // placeholder: enrichment lo sostituisce con il nome leggibile
        isActive: true,
        preferredExchange: exchangeId,
        exchangeSymbol: m.exchangeSymbol,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: pricesCoins.symbol })
      .returning({ symbol: pricesCoins.symbol });
    if (ins.length > 0) {
      inserted++;
      if (insertedSymbols.length < 10) insertedSymbols.push(sym);
    }
  }

  revalidatePath("/admin/modules/prices/exchanges");
  revalidatePath("/admin/modules/prices/coins");

  return {
    ok: true,
    marketsFromExchange: markets.length,
    skippedLowVolume,
    skippedExisting: byCanonical.size - inserted,
    inserted,
    insertedSamples: insertedSymbols,
  };
}

export type EnrichMetadataResult =
  | {
      ok: true;
      candidatesLoaded: number;
      matched: number;
      enriched: number;
      noMatch: number;
      errors: number;
      imageMirrorFailed: number;
      enrichedSamples: string[];
    }
  | { ok: false; error: string };

/**
 * Enrichment metadata dei coin senza coingecko_id (tipicamente quelli
 * appena importati wholesale da exchange). Match symbol → CoinGecko id,
 * recupera name/image/marketCap/sparkline e fa mirror dell'immagine su
 * R2. Idempotente: re-run salta i coin gia' arricchiti.
 */
export async function enrichCoinsMetadataAction(
  maxCount: number,
): Promise<EnrichMetadataResult> {
  await requireAdminSectionPage(SECTION_PERM);
  const { runMetadataEnrichment } = await import(
    "@/lib/modules/prices/enrichment"
  );
  const result = await runMetadataEnrichment(maxCount);
  if (result.ok) {
    revalidatePath("/admin/modules/prices/exchanges");
    revalidatePath("/admin/modules/prices/coins");
  }
  return result;
}

export type MetadataRefreshActionResult =
  | {
      ok: true;
      coinsLoaded: number;
      batchesFetched: number;
      updatedMarketCap: number;
      updatedSparkline: number;
      errors: number;
      durationMs: number;
    }
  | { ok: false; error: string };

/**
 * Trigger manuale del cron metadata-refresh (market_cap + rank +
 * sparkline 7d). A regime gira ogni 4h via pg_cron; questo bottone serve
 * per "non aspettare" dopo un import wholesale + enrichment.
 */
export async function refreshMetadataNowAction(): Promise<MetadataRefreshActionResult> {
  await requireAdminSectionPage(SECTION_PERM);
  const { runMetadataRefresh } = await import(
    "@/lib/modules/prices/services/metadata-refresh"
  );
  const result = await runMetadataRefresh();
  if (result.ok) {
    revalidatePath("/admin/modules/prices/exchanges");
    revalidatePath("/admin/modules/prices/coins");
  }
  return result;
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
