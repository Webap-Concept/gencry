import { db } from "@/lib/db/drizzle";
import { adminNavOrder } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * Cache in-memory dell'ordering override (TTL 60s). Evita un round-trip al
 * DB ad ogni render del layout admin (la sidebar si carica spesso).
 * Invalidata da `setNavOrder` / `resetNavOrder` dopo le mutate.
 */
let _cache: Record<string, number> | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateNavOrderCache(): void {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Ritorna la mappa `itemKey → sortOrder` degli override correnti.
 * Mappa vuota se nessun override è stato salvato (tutti i top-level
 * usano l'ordine del codice).
 */
export async function getNavOrderOverrides(): Promise<Record<string, number>> {
  if (_cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }
  const rows = await db
    .select({ itemKey: adminNavOrder.itemKey, sortOrder: adminNavOrder.sortOrder })
    .from(adminNavOrder);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.itemKey] = r.sortOrder;
  _cache = map;
  _cacheAt = Date.now();
  return map;
}

/**
 * Sostituisce TUTTI gli override con `updates`. Le righe non più presenti
 * vengono rimosse → torna ai default del codice. Atomico via transazione.
 */
export async function setNavOrder(
  updates: { itemKey: string; sortOrder: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(adminNavOrder);
    if (updates.length > 0) {
      const now = new Date();
      await tx
        .insert(adminNavOrder)
        .values(updates.map((u) => ({ ...u, updatedAt: now })));
    }
  });
  invalidateNavOrderCache();
}

/** Cancella tutti gli override → la sidebar torna ai default del codice. */
export async function resetNavOrder(): Promise<void> {
  await db.execute(sql`DELETE FROM admin_nav_order`);
  invalidateNavOrderCache();
}
