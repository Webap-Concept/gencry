"use client";
// components/modules/coins/coin-summary-card.tsx
//
// Header informativo del feed /explore?ticker=<COIN>.
//
// Geometria — DUE ELEMENTI DOM SEPARATI, mai uno che cambia altezza:
//
//   1) "Card espansa"   → riga "Discussioni su" + snapshot coin
//                         inline. Full-width main (esce dal padding del
//                         ProtectedShell), no border, no radius. Tema
//                         invertito: anche se l'utente è in sabbia,
//                         questo blocco usa la palette bosco (verde
//                         scuro) tramite la classe scope `.gc-dark` sul
//                         wrapper — le custom properties `--gc-*` sono
//                         ereditate dai children Tailwind.
//   2) "Sentinel"       → 1px in-flow, in mezzo. Osservato da
//                         `useIsStuck`.
//   3) "Sticky bar"     → container `position: sticky`, height 0 in-flow
//                         (no reflow al flip). Bar absolute dentro,
//                         sempre montata, animata solo via opacity +
//                         transform. Tema invertito come la card.
//
// Pattern motivato in commit `81724a74`: cramming entrambi gli stati
// visivi in un singolo sticky che cambiava altezza causava l'effetto
// "molla" durante lo scroll.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoinView } from "@/lib/modules/prices/queries";
import { useIsStuck } from "@/lib/hooks/use-is-stuck";
import { CoinIcon } from "./coin-icon";
import { CoinPriceLabel } from "./coin-price-label";
import { MiniSparkline } from "./mini-sparkline";
import { formatCompactCount, mockWatchlistCount } from "./mock-watchlist";

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
  return `${sign}${value.toFixed(2)}%`;
}

export function CoinSummaryCard({ coin }: { coin: CoinView }) {
  const { sentinelRef, isStuck } = useIsStuck<HTMLDivElement>();
  const tExplore = useTranslations("posts.explore");
  const tLabels = useTranslations("prices.labels");
  const href = `/coins/${coin.symbol.toLowerCase()}`;
  const wlCount = mockWatchlistCount(coin.symbol);

  const changeTone =
    coin.change24h === null
      ? "text-gc-fg-3"
      : coin.change24h > 0
        ? "text-gc-pos"
        : coin.change24h < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    <>
      {/* 1) Card espansa — full-main width, tema invertito (bosco).
          `gc-dark` ridefinisce le custom properties `--gc-*` per i
          children senza toccare il tema globale dell'utente. */}
      <div className="gc-dark -mx-4 sm:-mx-6 lg:-mx-8">
        {/* Riga "Discussioni su" — verde più chiaro, font display serif */}
        <div
          className="bg-gc-bg-3 text-gc-fg-2 px-4 sm:px-6 lg:px-8 py-2"
          role="heading"
          aria-level={2}>
          <span className="font-display text-lg leading-snug">
            {tExplore("discussions_about", { ticker: `$${coin.symbol}` })}
          </span>
        </div>

        {/* Snapshot coin inline — niente card chrome, sfondo verde scuro */}
        <Link
          href={href}
          prefetch={false}
          className="block bg-gc-bg px-4 sm:px-6 lg:px-8 py-4 hover:bg-gc-bg-2/40 transition-colors">
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
            {typeof coin.marketCapRank === "number" && coin.marketCapRank > 0 && (
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gc-bg-3 border border-gc-line text-gc-fg-2 tabular-nums">
                #{coin.marketCapRank}
              </span>
            )}
          </header>
          <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
            <CoinPriceLabel
              price={coin.price}
              change24h={coin.change24h}
              size="md"
            />
            <MiniSparkline
              id={`summary-${coin.symbol}`}
              points={coin.weeklySparkline}
              width={120}
              height={40}
              ariaLabel={tLabels("weekly_chart_aria")}
            />
          </div>
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
        </Link>
      </div>

      {/* 2) Sentinel */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {/* 3) Sticky bar — tema invertito, h-0 outer per zero reflow */}
      <div className="gc-dark sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 h-0">
        <Link
          href={href}
          prefetch={false}
          aria-hidden={!isStuck}
          tabIndex={isStuck ? 0 : -1}
          className={`absolute inset-x-0 top-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 border-b border-gc-line bg-gc-bg-2/90 text-gc-fg hover:bg-gc-bg-2 transition-[opacity,transform] duration-150 ease-out ${
            isStuck
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-1 pointer-events-none"
          }`}
          style={{
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}>
          <CoinIcon
            symbol={coin.symbol}
            name={coin.name}
            imageUrl={coin.imageUrl}
            size="sm"
          />
          <span className="text-sm font-semibold text-gc-fg">
            ${coin.symbol}
          </span>
          <span className="text-sm font-semibold text-gc-fg tabular-nums ml-auto">
            {formatPrice(coin.price)}
          </span>
          <span className={`text-xs tabular-nums ${changeTone}`}>
            {formatChange(coin.change24h)}
          </span>
          <ArrowUpRight
            size={14}
            strokeWidth={1.75}
            className="text-gc-fg-3 shrink-0"
            aria-hidden
          />
        </Link>
      </div>
    </>
  );
}
