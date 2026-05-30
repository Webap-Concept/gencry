import "server-only";
// lib/modules/prices/services/sync-tick.ts
//
// Contatore Redis per il tiering del fetch: ogni run del cron sync
// incrementa il tick. La logica di tiering filtra i coin CoinGecko in
// base al modulo del tick:
//   Tier 1 (rank ≤ 100):        ogni tick      (sempre)
//   Tier 2 (rank 101-400):      tick % 2 === 0 (ogni 2 run = 2 min)
//   Tier 3 (rank > 400 / null): tick % 6 === 0 (ogni 6 run = 6 min)
//
// Se Redis non è configurato il tick restituisce 0 → tutti i coin vengono
// fetchati (comportamento legacy, nessuna degradazione).
//
// I coin con exchange routing (preferred_exchange IS NOT NULL) non sono
// soggetti al tiering: vengono sempre fetchati in bulk dall'exchange.

import { getRedisClient } from "@/lib/kv/sdk";

const TICK_KEY = "prices:sync:tick";

export type CoinTier = 1 | 2 | 3;

export function getTierForCoin(marketCapRank: number | null): CoinTier {
  if (marketCapRank === null || marketCapRank > 400) return 3;
  if (marketCapRank > 100) return 2;
  return 1;
}

export function shouldFetchThisTick(tier: CoinTier, tick: number): boolean {
  if (tier === 1) return true;
  if (tier === 2) return tick % 2 === 0;
  return tick % 6 === 0;
}

export async function getAndIncrSyncTick(): Promise<number> {
  const client = await getRedisClient();
  if (!client) return 0;
  try {
    return await client.incr(TICK_KEY);
  } catch (err) {
    console.warn("[sync-tick] INCR failed, fallback tick=0:", err);
    return 0;
  }
}
