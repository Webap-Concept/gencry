// components/modules/coins/coin-card.tsx
// Card coin: icona + nome + simbolo + prezzo + variazione 24h + sparkline 7gg.
// Pure presentational, server-component compatibile.
//
// Layout responsive: su mobile la sparkline scende sotto il blocco prezzo
// per evitare overflow; da sm: in poi torna affiancata.
import type { CoinView } from "@/lib/modules/prices/queries";
import { cn } from "@/lib/utils";
import { CoinIcon } from "./coin-icon";
import { CoinPriceLabel } from "./coin-price-label";
import { MiniSparkline } from "./mini-sparkline";

export function CoinCard({
  coin,
  className,
}: {
  coin: CoinView;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl p-4 bg-gc-bg-2 border border-gc-line transition-colors hover:border-gc-line-2",
        className,
      )}
      aria-label={`${coin.name} (${coin.symbol})`}
    >
      {/* Header: icona + nome + simbolo */}
      <header className="flex items-start gap-3 min-w-0">
        <CoinIcon symbol={coin.symbol} imageUrl={coin.imageUrl} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gc-fg truncate">
            {coin.name}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-gc-fg-3">
            {coin.symbol}
          </div>
        </div>
      </header>

      {/* Body: prezzo + sparkline */}
      <div className="mt-3 flex items-end justify-between gap-3 flex-wrap">
        <CoinPriceLabel
          price={coin.price}
          change24h={coin.change24h}
          size="md"
        />
        <MiniSparkline
          points={coin.weeklySparkline}
          width={96}
          height={32}
        />
      </div>
    </article>
  );
}
