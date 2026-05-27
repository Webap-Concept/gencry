// app/api/coins/[symbol]/chart/route.ts
//
// API on-demand per i grafici della scheda coin (PR3 refactor
// Redis-first). Sostituisce gradualmente
// `/api/modules/prices/[symbol]/history` (che legge da `prices_history`):
//
//   - Coin mappato su un exchange (preferred_exchange + exchange_symbol):
//     fetch DIRETTO via adapter (Binance /klines, KuCoin ecc.) con
//     edge cache `unstable_cache` 5 min. Niente DB write per i grafici.
//
//   - Coin NON mappato (tail): fallback al vecchio `getHistorySeries`
//     che usa DB + CoinGecko storico. Stesso payload shape per il
//     consumer client.
//
// Niente auth: i prezzi sono pubblici, la pagina coin stessa e' public.
// Edge-friendly: nessuna chiamata Drizzle nel path Binance, solo
// fetch HTTP + cache + JSON. La route resta node-runtime per supportare
// il fallback DB sui coin tail.

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getExchangeAdapter } from "@/lib/modules/prices/exchanges/registry";
import type { ChartRange } from "@/lib/modules/prices/exchanges/types";
import {
  getHistorySeries,
  type HistoryRange,
  type HistorySeries,
} from "@/lib/modules/prices/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Range supportati dalla coin page UI. */
const VALID_RANGES: ChartRange[] = ["1d", "1w", "1m", "3m", "6m", "1y"];

/** Mapping dal range "exchange" (incluso 3m/6m) → range legacy
 *  HistoryRange per il fallback. 3m → 1m e 6m → 1y il piu' vicino. */
const RANGE_TO_LEGACY: Record<ChartRange, HistoryRange> = {
  "1d": "1d",
  "1w": "1w",
  "1m": "1m",
  "3m": "1m",
  "6m": "1y",
  "1y": "1y",
};

/** TTL cache per range. Range corto = TTL corto (dati piu' volatili). */
const TTL_BY_RANGE: Record<ChartRange, number> = {
  "1d": 60,    // 1 min
  "1w": 300,   // 5 min
  "1m": 900,   // 15 min
  "3m": 1800,  // 30 min
  "6m": 3600,  // 1h
  "1y": 3600,  // 1h
};

function parseRange(value: string | null): ChartRange {
  if (value && (VALID_RANGES as string[]).includes(value)) {
    return value as ChartRange;
  }
  return "1w";
}

/** Cache wrapper per il fetch Binance: stessa coppia (exchange_symbol,
 *  range) → 1 unica chiamata anche con N visit simultanee. Tag
 *  `coin-chart:<exchange>:<symbol>:<range>` permette future invalidation
 *  puntuali. */
function makeCachedExchangeFetch(
  exchangeId: string,
  exchangeSymbol: string,
  range: ChartRange,
) {
  return unstable_cache(
    async () => {
      const adapter = getExchangeAdapter(exchangeId);
      if (!adapter) return null;
      try {
        const points = await adapter.fetchHistorical(exchangeSymbol, range);
        return points;
      } catch (err) {
        console.warn(
          `[chart] exchange ${exchangeId} fetch failed for ${exchangeSymbol} ${range}`,
          err,
        );
        return null;
      }
    },
    ["coin-chart", exchangeId, exchangeSymbol, range],
    {
      revalidate: TTL_BY_RANGE[range],
      tags: [`coin-chart:${exchangeId}:${exchangeSymbol}:${range}`],
    },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));

  const symbolUpper = symbol.toUpperCase();

  // Lookup routing dalla DB. unstable_cache 5 min: la riga
  // prices_coins.preferred_exchange cambia raramente, non dobbiamo
  // pagare 1 query DB per ogni chart hit.
  const routing = await getCachedRouting(symbolUpper);

  if (routing?.preferredExchange && routing?.exchangeSymbol) {
    // Fast path: fetch direct dall'exchange con edge cache.
    const fetcher = makeCachedExchangeFetch(
      routing.preferredExchange,
      routing.exchangeSymbol,
      range,
    );
    const points = await fetcher();
    if (points && points.length > 0) {
      const payload: HistorySeries = {
        range: RANGE_TO_LEGACY[range],
        source: "coingecko", // legacy enum non ha "exchange"; accettiamo
        // di marcarlo "coingecko" per non rompere il consumer client.
        // PR4 estendera' l'enum a "exchange:<id>".
        points: points.map((p) => ({ ts: p.ts, price: p.price })),
      };
      return jsonResponse(payload, TTL_BY_RANGE[range]);
    }
    // Exchange fail / no data → cade sul fallback legacy
  }

  // Fallback path: vecchio getHistorySeries (DB → CoinGecko storico).
  // Per range non supportati dal legacy (3m, 6m) usiamo la mapping.
  const legacyRange = RANGE_TO_LEGACY[range];
  const series = await getHistorySeries(symbol, legacyRange);
  return jsonResponse(series, TTL_BY_RANGE[range]);
}

function jsonResponse<T>(data: T, ttlSeconds: number): NextResponse {
  return NextResponse.json(data, {
    headers: {
      // Edge cache hint allineato al TTL di unstable_cache.
      "Cache-Control": `public, max-age=${Math.floor(ttlSeconds / 2)}, stale-while-revalidate=${ttlSeconds}`,
    },
  });
}

interface CoinRouting {
  preferredExchange: string | null;
  exchangeSymbol: string | null;
}

/** Cached routing lookup. Stessa riga prices_coins viene letta da N
 *  request del coin /api/coins/<sym>/chart con range diversi → 1 sola
 *  query DB per simbolo per 5 min. */
async function getCachedRouting(symbolUpper: string): Promise<CoinRouting | null> {
  const cached = unstable_cache(
    async (): Promise<CoinRouting | null> => {
      const [row] = await db
        .select({
          preferredExchange: pricesCoins.preferredExchange,
          exchangeSymbol: pricesCoins.exchangeSymbol,
        })
        .from(pricesCoins)
        .where(eq(pricesCoins.symbol, symbolUpper))
        .limit(1);
      return row ?? null;
    },
    ["coin-routing", symbolUpper],
    { revalidate: 300, tags: [`coin-routing:${symbolUpper}`] },
  );
  try {
    return await cached();
  } catch (err) {
    console.warn(`[chart] routing lookup failed for ${symbolUpper}`, err);
    return null;
  }
}
