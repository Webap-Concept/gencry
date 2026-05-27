// lib/modules/prices/exchanges/queries.ts
//
// Server-only query layer per la UI admin /admin/modules/prices/exchanges.
// Combina le info dal DB (`price_exchanges` row) con l'adapter
// registrato in codice (presenza, label, needsApiKey). Restituisce
// shape arricchita pronta per il render.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { priceExchanges, pricesCoins } from "@/lib/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";
import { EXCHANGE_REGISTRY, getExchangeAdapter } from "./registry";
import type { ExchangeId } from "./types";

export interface AdminExchangeRow {
  id: string;
  label: string;
  enabled: boolean;
  /** True se esiste un adapter implementato in codice per questo id.
   *  Le row in DB potrebbero avere id non implementati (es. seedato per
   *  futuro ma adapter non scritto). */
  implemented: boolean;
  /** Da type adapter: "no" | "optional" | "required". null se !implemented. */
  needsApiKey: "no" | "optional" | "required" | null;
  hasApiKey: boolean;
  lastHealthCheck: Date | null;
  lastHealthOk: boolean | null;
  lastHealthError: string | null;
  /** Numero di coin con preferred_exchange = this.id. */
  routedCoinCount: number;
}

/** Lista completa exchanges (DB ∪ registry implementato). I record
 *  esistono in entrambe le direzioni:
 *    - DB ha la row ma adapter manca → implemented=false
 *    - Registry ha l'adapter ma DB no → implemented=true ma row mancante:
 *      la inseriamo al volo (idempotente) cosi' l'admin la vede subito. */
export async function listAdminExchanges(): Promise<AdminExchangeRow[]> {
  // Bootstrap: ogni id del registry deve avere una row corrispondente.
  const registryIds = Object.keys(EXCHANGE_REGISTRY) as ExchangeId[];
  for (const id of registryIds) {
    const adapter = EXCHANGE_REGISTRY[id];
    await db
      .insert(priceExchanges)
      .values({ id, label: adapter.label, enabled: true })
      .onConflictDoNothing({ target: priceExchanges.id });
  }

  // Carica tutte le row DB + counter coin routati in parallelo.
  const [rows, coinCounts] = await Promise.all([
    db.select().from(priceExchanges),
    db
      .select({
        preferredExchange: pricesCoins.preferredExchange,
        n: count(pricesCoins.symbol),
      })
      .from(pricesCoins)
      .groupBy(pricesCoins.preferredExchange),
  ]);

  const countMap = new Map<string, number>();
  for (const row of coinCounts) {
    if (row.preferredExchange) countMap.set(row.preferredExchange, row.n);
  }

  return rows.map((row) => {
    const adapter = getExchangeAdapter(row.id);
    return {
      id: row.id,
      label: row.label,
      enabled: row.enabled,
      implemented: !!adapter,
      needsApiKey: adapter?.needsApiKey ?? null,
      hasApiKey: !!row.apiKey,
      lastHealthCheck: row.lastHealthCheck,
      lastHealthOk: row.lastHealthOk,
      lastHealthError: row.lastHealthError,
      routedCoinCount: countMap.get(row.id) ?? 0,
    };
  });
}

/** Numero di coin attivi senza coingecko_id: candidati per
 *  l'enrichment metadata. Usato dalla card admin per mostrare quanti
 *  coin sono in attesa. */
export async function countCoinsAwaitingEnrichment(): Promise<number> {
  const [row] = await db
    .select({ n: count(pricesCoins.symbol) })
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        isNull(pricesCoins.coingeckoId),
      ),
    );
  return row?.n ?? 0;
}
