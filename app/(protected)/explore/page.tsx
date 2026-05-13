import { Suspense } from "react";
import { CoinCard, CoinCardSkeleton } from "@/components/modules/coins";
import { getCoinForCard } from "@/lib/modules/prices/queries";

export default function ExplorePage() {
  return (
    <div className="max-w-sm">
      <Suspense fallback={<CoinCardSkeleton />}>
        <BitcoinDemoCard />
      </Suspense>
    </div>
  );
}

async function BitcoinDemoCard() {
  const coin = await getCoinForCard("BTC");
  if (!coin) {
    return (
      <div className="rounded-2xl p-4 bg-gc-bg-2 border border-gc-line text-xs text-gc-fg-3">
        Bitcoin non è ancora attivo nel modulo prezzi. Aggiungilo da{" "}
        <span className="text-gc-fg-2">/admin/modules/prices/coins</span>.
      </div>
    );
  }
  return <CoinCard coin={coin} rank={1} />;
}
