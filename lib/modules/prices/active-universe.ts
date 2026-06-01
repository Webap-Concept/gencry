// lib/prices/active-universe.ts
// "Active universe" = set di coin che vale la pena tenere prezzati nel cron.
//
// Strategia attuale (Modulo 1, watchlist non ancora esistenti):
//   - prendiamo tutti i coin in `pricesCoins` con is_active=true
//   - filtro su last_seen_at >= now - prices_universe_hours (configurabile)
//   - se la tabella è vuota o non ha coin "freschi", restituiamo tutti gli
//     attivi (fallback per non lasciare il sistema inerte appena seedato)
//
// Quando arriverà il modulo watchlist (Decisione successiva), la query qui
// includerà JOIN con watchlist_coins e con i post recenti che referenziano coin.
import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { getPricesConfig } from "./config";

/**
 * I coin con market_cap_rank <= questa soglia vengono SEMPRE prezzati,
 * a prescindere da last_seen_at. È la rete di sicurezza contro lo
 * "starvation bug" (2026-06-01): se solo pochi coin minori risultano
 * "freschi" nella finestra universe_hours, senza questa soglia
 * affamerebbero i major (BTC/ETH/…), lasciando le loro pagine senza
 * prezzo → 404. I top-N restano sempre nell'universo.
 */
const ALWAYS_PRICE_TOP_RANK = 500;

export interface ActiveCoin {
  symbol: string;
  coingeckoId: string | null;
  /** Routing per il cron group-by-exchange (PR2 refactor Redis-first).
   *  Null = fallback CoinGecko per i coin senza mapping exchange. */
  preferredExchange: string | null;
  exchangeSymbol: string | null;
  /** Rank globale per market cap. Usato dal tiering fetch (Tier1 ≤100,
   *  Tier2 101-400, Tier3 >400). Null = coin non ancora enrichita → Tier3. */
  marketCapRank: number | null;
}

const COMMON_SELECT = {
  symbol: pricesCoins.symbol,
  coingeckoId: pricesCoins.coingeckoId,
  preferredExchange: pricesCoins.preferredExchange,
  exchangeSymbol: pricesCoins.exchangeSymbol,
  marketCapRank: pricesCoins.marketCapRank,
};

export async function getActiveUniverse(): Promise<ActiveCoin[]> {
  const cfg = await getPricesConfig();
  const cutoff = new Date(Date.now() - cfg.universeHours * 3600 * 1000);

  // Un coin e' fetchabile se ha ALMENO uno tra coingeckoId e mapping
  // exchange (con preferred_exchange + exchange_symbol valorizzati).
  // PR2: ampliato il filtro per non escludere i coin "exchange-only"
  // che potrebbero non avere coingeckoId (es. small cap su KuCoin/Gate).
  const hasFetchablePath = or(
    isNotNull(pricesCoins.coingeckoId),
    and(
      isNotNull(pricesCoins.preferredExchange),
      isNotNull(pricesCoins.exchangeSymbol),
    ),
  );

  // Universo = coin attivi+fetchabili che sono O recenti (last_seen entro la
  // finestra universe_hours) O top per market cap rank. Il ramo top-rank
  // garantisce che i major siano SEMPRE prezzati: l'universo non può
  // collassare su un sottoinsieme "fresco" di coin minori (starvation bug).
  const primary = await db
    .select(COMMON_SELECT)
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        hasFetchablePath,
        or(
          gte(pricesCoins.lastSeenAt, cutoff),
          and(
            isNotNull(pricesCoins.marketCapRank),
            lte(pricesCoins.marketCapRank, ALWAYS_PRICE_TOP_RANK),
          ),
        ),
      ),
    );

  if (primary.length > 0) return primary;

  // Fallback bootstrap: nessun coin fresco né ranked (es. subito dopo un
  // seed con rank non ancora popolato) → prezza tutti gli attivi fetchabili.
  return await db
    .select(COMMON_SELECT)
    .from(pricesCoins)
    .where(and(eq(pricesCoins.isActive, true), hasFetchablePath));
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
    .update(pricesCoins)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(and(eq(pricesCoins.isActive, true), inArray(pricesCoins.symbol, symbols)));
}
