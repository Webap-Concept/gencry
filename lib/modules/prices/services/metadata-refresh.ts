// lib/modules/prices/services/metadata-refresh.ts
//
// "Slow" refresh dei metadata semi-statici (market_cap, market_cap_rank,
// weekly_sparkline) per i coin che hanno gia' un coingecko_id.
//
// Perche' esiste: dopo il refactor Redis-first, i coin routati su
// Binance/KuCoin ricevono price+volume direttamente dall'exchange, che
// NON espone market cap. Senza questo cron, il market_cap resterebbe
// "fermo" all'ultimo enrichment manuale.
//
// Il cron prezzi (1-min) NON e' il posto giusto per questo: il
// market_cap cambia raramente vs prezzo/volume, e CoinGecko ha rate
// limit. Cadence 4h: 6 run/giorno, 4 call/run (250 ids per batch
// → 1000 coin coperti) = 24 call/giorno totali. Ampiamente sotto cap.

import "server-only";

import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getPricesConfig } from "../config";

const COINGECKO_FREE_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";
const TIMEOUT_MS = 15_000;
const MARKETS_BATCH = 250;

interface CoingeckoEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
}

async function resolveEndpoint(): Promise<CoingeckoEndpoint> {
  const cfg = await getPricesConfig();
  if (cfg.coingeckoProEnabled && cfg.coingeckoProApiKey) {
    return {
      baseUrl: COINGECKO_PRO_BASE,
      headers: {
        Accept: "application/json",
        "x-cg-pro-api-key": cfg.coingeckoProApiKey,
      },
    };
  }
  return {
    baseUrl: COINGECKO_FREE_BASE,
    headers: { Accept: "application/json" },
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

interface CoingeckoMarketsItem {
  id: string;
  market_cap?: number;
  market_cap_rank?: number;
  sparkline_in_7d?: { price?: number[] };
}

export type MetadataRefreshResult =
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
 * Esegue 1 pass di refresh metadata. Carica tutti i coin attivi con
 * coingecko_id, batchea su /coins/markets e UPDATE market_cap +
 * market_cap_rank in prices_coins + weekly_sparkline in prices_data.
 *
 * Errori per-batch sono contati ma non interrompono il run (il prossimo
 * tick li ricoprira').
 */
export async function runMetadataRefresh(): Promise<MetadataRefreshResult> {
  const started = Date.now();

  // 1. Coin DB da refreshare (con coingecko_id gia' matched).
  const coins = await db
    .select({
      symbol: pricesCoins.symbol,
      coingeckoId: pricesCoins.coingeckoId,
    })
    .from(pricesCoins)
    .where(
      and(
        eq(pricesCoins.isActive, true),
        isNotNull(pricesCoins.coingeckoId),
      ),
    );

  if (coins.length === 0) {
    return {
      ok: true,
      coinsLoaded: 0,
      batchesFetched: 0,
      updatedMarketCap: 0,
      updatedSparkline: 0,
      errors: 0,
      durationMs: Date.now() - started,
    };
  }

  // Map coingecko_id → DB symbol per ri-mappare i risultati API.
  const idToSymbol = new Map<string, string>();
  for (const c of coins) {
    if (c.coingeckoId) idToSymbol.set(c.coingeckoId, c.symbol);
  }
  const allIds = Array.from(idToSymbol.keys());

  let endpoint: CoingeckoEndpoint;
  try {
    endpoint = await resolveEndpoint();
  } catch (err) {
    return {
      ok: false,
      error: `resolveEndpoint: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  let batchesFetched = 0;
  let errors = 0;
  let updatedMarketCap = 0;
  let updatedSparkline = 0;

  for (let i = 0; i < allIds.length; i += MARKETS_BATCH) {
    const batch = allIds.slice(i, i + MARKETS_BATCH);
    const url = new URL(`${endpoint.baseUrl}/coins/markets`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("per_page", String(MARKETS_BATCH));
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "true");

    let items: CoingeckoMarketsItem[];
    try {
      const res = await fetchWithTimeout(url.toString(), {
        headers: endpoint.headers,
        cache: "no-store",
      });
      if (!res.ok) {
        errors++;
        continue;
      }
      items = (await res.json()) as CoingeckoMarketsItem[];
      batchesFetched++;
    } catch {
      errors++;
      continue;
    }

    // UPDATE per ogni item: market_cap+rank in prices_coins,
    // weekly_sparkline in prices_data. Loop sequenziale: per 1000 coin
    // sono ~1-2s totali, trascurabile vs cron 4h.
    for (const it of items) {
      const sym = idToSymbol.get(it.id);
      if (!sym) continue;

      try {
        await db
          .update(pricesCoins)
          .set({
            marketCap: it.market_cap ?? null,
            marketCapRank: it.market_cap_rank ?? null,
            updatedAt: new Date(),
          })
          .where(eq(pricesCoins.symbol, sym));
        updatedMarketCap++;
      } catch {
        errors++;
      }

      const spark = downsampleSparkline(it.sparkline_in_7d?.price ?? null);
      if (spark && spark.length >= 2) {
        try {
          await db.execute(sql`
            UPDATE prices_data
            SET weekly_sparkline = ${JSON.stringify(spark)}::jsonb,
                weekly_sparkline_at = now()
            WHERE symbol = ${sym}
          `);
          updatedSparkline++;
        } catch {
          // non-fatal: la row prices_data potrebbe non esistere ancora
          // per i coin appena importati senza cron tick completato.
        }
      }
    }
  }

  return {
    ok: true,
    coinsLoaded: coins.length,
    batchesFetched,
    updatedMarketCap,
    updatedSparkline,
    errors,
    durationMs: Date.now() - started,
  };
}

function downsampleSparkline(points: number[] | null): number[] | null {
  if (!points || points.length < 2) return null;
  const target = 21;
  const finite = points.filter((n) => Number.isFinite(n));
  if (finite.length <= target) return finite;
  const step = finite.length / target;
  const out: number[] = [];
  for (let i = 1; i <= target; i++) {
    const idx = Math.min(finite.length - 1, Math.floor(i * step) - 1);
    out.push(finite[idx]);
  }
  return out;
}
