"use client";
// components/modules/watchlist/featured-watchlist-bar-client.tsx
//
// Barra "watchlist nel feed": renderizzata in cima alla home loggata
// quando l'utente ha una watchlist con `featured_in_feed`. Tema invertito
// (bosco) via scope `.gc-dark` come CoinSummaryCard — sempre verde scuro
// anche se l'utente è in sabbia.
//
// Stato compresso: mostra le prime COLLAPSED_COUNT coin + pill "+N altre".
// Espanso: tutte + "Comprimi". Il toggle appare solo se ci sono più coin
// di COLLAPSED_COUNT. Ogni chip linka a /coins/<symbol>.

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MiniSparkline } from "@/components/modules/coins/mini-sparkline";
import { cn } from "@/lib/utils";

export interface FeaturedChip {
  symbol: string;
  price: number;
  change24h: number | null;
  sparkline: number[];
}

// Numero di coin visibili in stato compresso (matcha il mock: 1 riga su
// desktop). Oltre questo soglia compare il toggle "+N altre".
const COLLAPSED_COUNT = 4;

export function FeaturedWatchlistBarClient({
  watchlistId,
  name,
  coins,
}: {
  watchlistId: string;
  name: string;
  coins: FeaturedChip[];
}) {
  const t = useTranslations("watchlist.feed");
  const [expanded, setExpanded] = useState(false);

  const hasMore = coins.length > COLLAPSED_COUNT;
  const visible = expanded || !hasMore ? coins : coins.slice(0, COLLAPSED_COUNT);
  const hiddenCount = coins.length - COLLAPSED_COUNT;

  return (
    <section className="gc-dark rounded-2xl bg-gc-bg-2 border border-gc-line p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <Link
          href={`/watchlist/${watchlistId}`}
          prefetch={false}
          aria-label={t("open_aria", { name })}
          className="font-display text-lg leading-snug text-gc-fg hover:text-gc-fg-2 transition-colors truncate"
        >
          {name}
        </Link>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gc-line-2 bg-gc-bg-3 px-3 py-1 text-[11px] font-medium text-gc-fg-2 hover:bg-gc-bg transition-colors"
          >
            {expanded ? (
              <>
                {t("show_less")}
                <ChevronUp size={12} strokeWidth={2} aria-hidden />
              </>
            ) : (
              <>
                {t("show_more", { count: hiddenCount })}
                <ChevronDown size={12} strokeWidth={2} aria-hidden />
              </>
            )}
          </button>
        ) : null}
      </header>

      <ul className="flex flex-wrap gap-2">
        {visible.map((c) => (
          <li key={c.symbol}>
            <CoinChip coin={c} ariaLabel={t("coin_aria", { symbol: c.symbol })} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CoinChip({ coin, ariaLabel }: { coin: FeaturedChip; ariaLabel: string }) {
  const tone =
    coin.change24h === null || !Number.isFinite(coin.change24h)
      ? "text-gc-fg-3"
      : coin.change24h > 0
        ? "text-gc-pos"
        : coin.change24h < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    <Link
      href={`/coins/${coin.symbol.toLowerCase()}`}
      prefetch={false}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-2 rounded-full border border-gc-line bg-gc-bg-3 px-3 py-1.5 hover:bg-gc-bg transition-colors"
    >
      <span className="text-xs font-semibold text-gc-fg uppercase tracking-wide">
        {coin.symbol}
      </span>
      <span className="text-xs tabular-nums text-gc-fg-2">
        {formatPrice(coin.price)}
      </span>
      <span className={cn("text-[11px] font-medium tabular-nums", tone)}>
        {formatChange(coin.change24h)}
      </span>
      <MiniSparkline
        id={`feat-${coin.symbol}`}
        points={coin.sparkline}
        width={44}
        height={16}
        ariaLabel=""
      />
    </Link>
  );
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
