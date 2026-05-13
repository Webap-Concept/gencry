import { NextResponse } from "next/server";
import {
  getHistorySeries,
  type HistoryRange,
} from "@/lib/modules/prices/queries";

/**
 * GET /api/modules/prices/[symbol]/history?range=1d|1w|1m|1y
 *
 * Endpoint client-facing per il grafico interattivo della pagina coin.
 * DB-first (downsampling SQL) con fallback CoinGecko quando la nostra
 * `prices_history` non copre la finestra richiesta. Cache server-side
 * stratificata: TTL minore per finestre vicine al cron (1d=60s), più
 * lungo per dati storici stabili (1y=1h).
 *
 * Niente auth: i dati prezzi sono pubblici e leggibili da anonimi.
 */

const VALID_RANGES: HistoryRange[] = ["1d", "1w", "1m", "1y"];

function parseRange(value: string | null): HistoryRange {
  if (value && (VALID_RANGES as string[]).includes(value)) {
    return value as HistoryRange;
  }
  return "1w";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));

  const series = await getHistorySeries(symbol, range);

  return NextResponse.json(series, {
    headers: {
      // Hint per il browser/CDN: il TTL del unstable_cache lato server
      // copre già la maggior parte dei page view, ma se Vercel mette un
      // edge cache davanti, allineamoci.
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
}
