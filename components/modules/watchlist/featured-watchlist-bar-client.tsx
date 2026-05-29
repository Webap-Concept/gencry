"use client";
// components/modules/watchlist/featured-watchlist-bar-client.tsx
//
// Barra "watchlist nel feed": renderizzata in cima alla home loggata
// quando l'utente ha una watchlist con `featured_in_feed`. Tema invertito
// (bosco) via scope `.gc-dark` come CoinSummaryCard — sempre verde scuro
// anche se l'utente è in sabbia.
//
// Stato compresso: UNA sola riga di coin (clip CSS `max-h`), con pill
// "+N altre" dove N è misurato runtime (quante chip finiscono oltre la
// prima riga — dipende dalla larghezza del viewport, non da un count
// fisso). Espanso: tutte le coin in wrap + "Comprimi". Accanto al nome
// il rendimento 30g della watchlist.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

export function FeaturedWatchlistBarClient({
  watchlistId,
  name,
  perf30dPct,
  coins,
}: {
  watchlistId: string;
  name: string;
  perf30dPct: number | null;
  coins: FeaturedChip[];
}) {
  const t = useTranslations("watchlist.feed");
  const [expanded, setExpanded] = useState(false);
  // Quante chip finiscono oltre la prima riga (misurato dal layout reale,
  // responsive). 0 finché non misurato → niente toggle al primo paint.
  const [hiddenCount, setHiddenCount] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Misura post-mount + a ogni resize: conta le chip con offsetTop oltre
  // quello della prima (= righe successive). overflow-hidden non altera
  // offsetTop, quindi la misura è corretta anche in stato compresso.
  useEffect(() => {
    const measure = () => {
      const ul = listRef.current;
      if (!ul) return;
      const items = Array.from(ul.children) as HTMLElement[];
      if (items.length === 0) {
        setHiddenCount(0);
        return;
      }
      const firstTop = items[0].offsetTop;
      let visible = 0;
      for (const it of items) {
        if (it.offsetTop > firstTop) break;
        visible++;
      }
      setHiddenCount(Math.max(0, items.length - visible));
    };
    measure();
    const ul = listRef.current;
    if (!ul || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    return () => ro.disconnect();
  }, [coins.length]);

  const hasMore = hiddenCount > 0;
  const perfTone =
    perf30dPct === null || !Number.isFinite(perf30dPct)
      ? "text-gc-fg-3"
      : perf30dPct > 0
        ? "text-gc-pos"
        : perf30dPct < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    <section className="gc-dark rounded-2xl bg-gc-bg-2 border border-gc-line p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <Link
            href={`/watchlist/${watchlistId}`}
            prefetch={false}
            aria-label={t("open_aria", { name })}
            className="font-display text-lg leading-snug text-gc-fg hover:text-gc-fg-2 transition-colors truncate"
          >
            {name}
          </Link>
          {perf30dPct !== null && Number.isFinite(perf30dPct) ? (
            <span className={cn("shrink-0 text-sm font-semibold tabular-nums", perfTone)}>
              {perf30dPct > 0 ? "+" : ""}
              {perf30dPct.toFixed(1)}%
            </span>
          ) : null}
        </div>
        {hasMore || expanded ? (
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

      {/* Compresso: max-h di una riga (h-8 chip + clip). overflow-hidden
          taglia visivamente le righe successive ma le chip restano nel DOM
          (misurabili). Espanso: nessun cap → wrap su più righe. */}
      <ul
        ref={listRef}
        className={cn(
          "flex flex-wrap gap-2 overflow-hidden transition-[max-height] duration-200",
          !expanded && "max-h-9",
        )}
      >
        {coins.map((c) => (
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
