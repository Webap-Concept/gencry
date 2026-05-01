// lib/prices/active-universe.ts
// "Active universe" = set di coin che vale la pena tenere prezzati nel cron.
//
// Strategia attuale (Modulo 1, watchlist non ancora esistenti):
//   - prendiamo tutti i coin in `coins` con is_active=true
//   - filtro su last_seen_at >= now - prices_universe_hours (configurabile)
//   - se la tabella è vuota o non ha coin "freschi", restituiamo tutti gli
//     attivi (fallback per non lasciare il sistema inerte appena seedato)
//
// Quando arriverà il modulo watchlist (Decisione successiva), la query qui
// includerà JOIN con watchlist_coins e con i post recenti che referenziano coin.
import { db } from "@/lib/db/drizzle";
import { coins } from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getPricesConfig } from "./config";

export interface ActiveCoin {
  symbol: string;
  coingeckoId: string | null;
}

export async function getActiveUniverse(): Promise<ActiveCoin[]> {
  const cfg = await getPricesConfig();
  const cutoff = new Date(Date.now() - cfg.universeHours * 3600 * 1000);

  const fresh = await db
    .select({ symbol: coins.symbol, coingeckoId: coins.coingeckoId })
    .from(coins)
    .where(
      and(
        eq(coins.isActive, true),
        gte(coins.lastSeenAt, cutoff),
        isNotNull(coins.coingeckoId),
      ),
    );

  if (fresh.length > 0) return fresh;

  // Fallback: appena seedato, last_seen_at potrebbe essere lo stesso created_at
  // ma la query sopra dovrebbe già includerli. Questo branch copre il caso in
  // cui la finestra sia stata ridotta sotto pochi minuti.
  return await db
    .select({ symbol: coins.symbol, coingeckoId: coins.coingeckoId })
    .from(coins)
    .where(and(eq(coins.isActive, true), isNotNull(coins.coingeckoId)));
}

/**
 * Aggiorna last_seen_at per i coin attualmente "interessanti".
 * Chiamato quando un coin compare in un post / watchlist (futuro) o
 * quando l'utente apre un widget che lo mostra.
 */
export async function touchCoinsSeen(symbols: string[]): Promise<void> {
  if (symbols.length === 0) return;
  const now = new Date();
  await db
    .update(coins)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(and(eq(coins.isActive, true), inArray(coins.symbol, symbols)));
}
