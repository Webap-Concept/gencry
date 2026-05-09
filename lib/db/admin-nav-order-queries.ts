import { db } from "@/lib/db/drizzle";
import { adminNavOrder } from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";

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
 * Upsert degli override forniti. Le keys non incluse in `updates` NON
 * vengono toccate — questo permette di salvare un subset (es. solo i
 * top-level, o solo le child di un drawer) senza azzerare gli altri
 * override già persistiti.
 */
export async function setNavOrder(
  updates: { itemKey: string; sortOrder: number }[],
): Promise<void> {
  if (updates.length === 0) {
    invalidateNavOrderCache();
    return;
  }
  const now = new Date();
  await db
    .insert(adminNavOrder)
    .values(updates.map((u) => ({ ...u, updatedAt: now })))
    .onConflictDoUpdate({
      target: adminNavOrder.itemKey,
      set: {
        sortOrder: sql`excluded.sort_order`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  invalidateNavOrderCache();
}

/**
 * Cancella gli override per le sole `keys` indicate. Usato dai pulsanti
 * "Reset" granulari (top-level e per-drawer) per non distruggere gli
 * override degli altri scope.
 */
export async function clearNavOrderForKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    invalidateNavOrderCache();
    return;
  }
  await db.delete(adminNavOrder).where(inArray(adminNavOrder.itemKey, keys));
  invalidateNavOrderCache();
}
