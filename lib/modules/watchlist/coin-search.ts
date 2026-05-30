"use server";
// lib/modules/watchlist/coin-search.ts
//
// Server search delle coin tracciate per il widget "Aggiungi coin".
// Match LIKE su symbol (case-insensitive) o name (case-insensitive).
// Solo coin attive. Ordinato per marketCapRank ASC (le piu' importanti
// prima). Risultati cappati a 10 — il widget non ha paginazione, e per
// matching ambigui chi cerca "btc" deve trovare Bitcoin in testa.
//
// Non e' un endpoint pubblico, quindi richiede AUTH (l'aggiunta di coin
// e' gated comunque dalla addCoinAction).

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";
import { getHotPrices } from "@/lib/modules/prices/services/hot-prices";

export type CoinSearchResult = {
  symbol: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  change24h: number | null;
};

const MAX_RESULTS = 10;
const MIN_QUERY_LEN = 1;

export async function searchTrackedCoinsAction(
  query: string,
): Promise<CoinSearchResult[]> {
  const viewer = await getUser();
  if (!viewer) return [];

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LEN) return [];

  // % escape: ilike usa wildcard %, qui non vogliamo che il caller li
  // possa inserire (search libera). Rimuoviamo %, _, e affichiamo i
  // nostri propri.
  const safe = trimmed.replace(/[%_]/g, "");
  if (safe.length === 0) return [];

  const pattern = `%${safe}%`;

  const [rows, hot] = await Promise.all([
    db
      .select({
        symbol:        pricesCoins.symbol,
        name:          pricesCoins.name,
        imageUrl:      pricesCoins.imageUrl,
        marketCapRank: pricesCoins.marketCapRank,
      })
      .from(pricesCoins)
      .where(
        and(
          eq(pricesCoins.isActive, true),
          or(
            ilike(pricesCoins.symbol, pattern),
            ilike(pricesCoins.name, pattern),
          ),
        ),
      )
      .orderBy(asc(pricesCoins.marketCapRank))
      .limit(MAX_RESULTS),
    getHotPrices(),
  ]);

  return rows.map((r) => {
    const q = hot?.quotes[r.symbol];
    return {
      symbol:    r.symbol,
      name:      r.name,
      imageUrl:  r.imageUrl,
      price:     q?.price ?? null,
      change24h: q?.change24h ?? null,
    };
  });
}
