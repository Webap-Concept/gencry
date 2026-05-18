// components/modules/posts/TrendingCoinsRow.tsx
//
// Server Component: top 4 coin più menzionati nelle ultime 24h
// renderizzati come grid di CoinCard. Sostituisce il vecchio
// TrendingTickersRow (row di pill testuali).
//
// Pattern data flow:
//   1. getTrendingTickers → top symbols + post count (cache 5min)
//   2. getCoinForCard(symbol) per ognuno → CoinView con price/change/icon
//   3. Skip silente dei ticker non tracciati dal modulo prices
//   4. Render grid responsive 1 col mobile → 2 col da sm in poi
//
// Pattern GetStream §8: trending è query separata, non parte del feed
// cronologico → niente impatto su getFeedIds().
import { getTranslations } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { unstable_cache } from "next/cache";
import { getTrendingTickers } from "@/lib/modules/posts/queries";
import { getCoinForCard, type CoinView } from "@/lib/modules/prices/queries";
import { CoinCard } from "@/components/modules/coins/coin-card";

const TRENDING_TAG = "posts:trending-tickers";
const MAX_COINS = 4;
// Over-fetch leggero: alcuni ticker trending potrebbero non essere
// tracciati dal modulo prices (es. nuovi/obscuri); fetchamo 2× e
// teniamo i primi MAX_COINS resolti.
const FETCH_LIMIT = MAX_COINS * 2;

const getCachedTrending = unstable_cache(
  async () => getTrendingTickers({ windowHours: 24, limit: FETCH_LIMIT }),
  ["posts-trending-tickers-24h-top8"],
  { revalidate: 300, tags: [TRENDING_TAG] },
);

export async function TrendingCoinsRow() {
  const rows = await getCachedTrending();
  if (rows.length === 0) return null;

  // Hydrate i CoinView in parallelo. Filter dei null (ticker non
  // tracciati dal modulo prices) e taglio a MAX_COINS.
  const resolved = await Promise.all(
    rows.map(async (r) => {
      const coin = await getCoinForCard(r.ticker);
      return coin ? { coin, postCount: r.postCount } : null;
    }),
  );
  const coins = resolved
    .filter((x): x is { coin: CoinView; postCount: number } => x !== null)
    .slice(0, MAX_COINS);

  if (coins.length === 0) return null;

  const t = await getTranslations("posts.trending");

  return (
    <section
      aria-labelledby="trending-coins-heading"
      className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <h2
        id="trending-coins-heading"
        className="flex items-center gap-2 text-xs uppercase tracking-wider text-gc-fg-3 mb-3">
        <TrendingUp size={13} strokeWidth={1.75} aria-hidden />
        {t("section_title")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {coins.map(({ coin }) => (
          <CoinCard key={coin.symbol} coin={coin} />
        ))}
      </div>
    </section>
  );
}
