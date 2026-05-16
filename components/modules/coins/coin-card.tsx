"use client";
// components/modules/coins/coin-card.tsx
// Card coin: icona + nome + simbolo + categoria + chip rank + prezzo +
// variazione 24h + sparkline 21pt + footer "In Nk watchlist" (mockup).
// Pure presentational. Reso "use client" perché è importato anche da
// CoinSummaryCard (client component sticky-aware) — un Server Component
// non può essere importato come JSX da un Client Component in Next.js
// App Router. useTranslations va bene client-side, no I/O.
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CoinView } from "@/lib/modules/prices/queries";
import { cn } from "@/lib/utils";
import { CoinIcon } from "./coin-icon";
import { CoinPriceLabel } from "./coin-price-label";
import { MiniSparkline } from "./mini-sparkline";
import { formatCompactCount, mockWatchlistCount } from "./mock-watchlist";

export function CoinCard({
  coin,
  rank,
  watchlistCount,
  href,
  className,
}: {
  coin: CoinView;
  /** Posizione per market cap. Se null/undefined la chip non si mostra. */
  rank?: number | null;
  /** Numero di watchlist in cui appare il coin. Se omesso, viene
   *  generato un mockup deterministico (la feature reale non esiste
   *  ancora). Quando la query reale arriverà, basterà passarla qui. */
  watchlistCount?: number | null;
  /** Destinazione del click sulla card. Default `/coins/<symbol>`. Passa
   *  `null` per renderla non-cliccabile (es. preview admin). */
  href?: string | null;
  className?: string;
}) {
  const wlCount = watchlistCount ?? mockWatchlistCount(coin.symbol);
  const resolvedHref =
    href === null ? null : (href ?? `/coins/${coin.symbol.toLowerCase()}`);
  const tLabels = useTranslations("prices.labels");

  return (
    <article
      className={cn(
        "relative rounded-2xl p-4 bg-gc-bg-2 border border-gc-line transition-colors",
        resolvedHref &&
          "hover:border-gc-line-2 focus-within:border-gc-line-2",
        className,
      )}
      aria-label={`${coin.name} (${coin.symbol})`}
    >
      {resolvedHref && (
        <Link
          href={resolvedHref}
          prefetch={false}
          className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
          aria-label={tLabels("coin_details_aria", { name: coin.name })}
        />
      )}
      {/* Header */}
      <header className="flex items-start gap-3 min-w-0">
        <CoinIcon
          symbol={coin.symbol}
          name={coin.name}
          imageUrl={coin.imageUrl}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gc-fg truncate">
            {coin.name}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gc-fg-3 mt-0.5">
            <span>{coin.symbol}</span>
            {coin.category && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate normal-case tracking-normal">
                  {coin.category}
                </span>
              </>
            )}
          </div>
        </div>
        {typeof rank === "number" && rank > 0 && (
          <span
            className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gc-bg-3 border border-gc-line text-gc-fg-2 tabular-nums"
            aria-label={tLabels("rank_aria", { rank })}
          >
            #{rank}
          </span>
        )}
      </header>

      {/* Body */}
      <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
        <CoinPriceLabel
          price={coin.price}
          change24h={coin.change24h}
          size="md"
        />
        <MiniSparkline
          id={coin.symbol}
          points={coin.weeklySparkline}
          width={120}
          height={40}
          ariaLabel={tLabels("weekly_chart_aria")}
        />
      </div>

      {/* Footer — watchlist count (mockup finché la feature reale non esiste).
          ICU rich text non disponibile in next-intl server: usiamo split
          "In {count} watchlist" → {prefix}<strong>{count}</strong>{suffix}
          se servisse styling separato. Qui basta il template piatto. */}
      <footer className="mt-3 pt-3 border-t border-gc-line text-[11px] text-gc-fg-3">
        {tLabels.rich("watchlist_count", {
          count: formatCompactCount(wlCount),
          strong: (chunks) => (
            <span className="font-semibold text-gc-fg-2 tabular-nums">
              {chunks}
            </span>
          ),
        })}
      </footer>
    </article>
  );
}
