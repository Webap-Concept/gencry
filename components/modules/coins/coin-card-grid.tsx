// components/modules/coins/coin-card-grid.tsx
// Server-component "smart" che fetcha i top coin e li dispone in una grid
// responsive. Usare wrappato in <Suspense fallback={<CoinCardGridSkeleton />}>
// per beneficiare dello streaming RSC.
import { getTranslations } from "next-intl/server";
import { getTopCoinsForCards } from "@/lib/modules/prices/queries";
import { getWatchlistCountsForSymbols } from "@/lib/modules/watchlist/queries";
import { cn } from "@/lib/utils";
import { CoinCard } from "./coin-card";
import { CoinCardSkeleton } from "./coin-card-skeleton";

export async function CoinCardGrid({
  limit = 50,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  const coins = await getTopCoinsForCards(limit);

  if (coins.length === 0) {
    const tEmpty = await getTranslations("prices.empty_states");
    return (
      <div className="text-sm text-gc-fg-3 text-center py-12">
        {tEmpty("no_active_coins")}
      </div>
    );
  }

  // Counter watchlist reali in UNA query (no N+1 sulla griglia).
  const wlCounts = await getWatchlistCountsForSymbols(
    coins.map((c) => c.symbol),
  );

  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {coins.map((coin) => (
        <CoinCard
          key={coin.symbol}
          coin={coin}
          rank={coin.marketCapRank}
          watchlistCount={wlCounts.get(coin.symbol.toUpperCase()) ?? 0}
        />
      ))}
    </div>
  );
}

export function CoinCardGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <CoinCardSkeleton key={i} />
      ))}
    </div>
  );
}
