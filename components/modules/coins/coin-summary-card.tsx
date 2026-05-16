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
import { ArrowUpRight, BookmarkPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoinView } from "@/lib/modules/prices/queries";
import { useIsStuck } from "@/lib/hooks/use-is-stuck";
import { CoinIcon } from "./coin-icon";
import { CoinPriceLabel } from "./coin-price-label";
import { MiniSparkline } from "./mini-sparkline";
import { formatCompactCount, mockWatchlistCount } from "./mock-watchlist";

// Colori "sabbia" hardcoded usati dalle isole light dentro lo scope
// `.gc-dark` (pill prezzo/change nella sticky bar). Sono gli stessi
// valori in `:root` di frontend.css — qui replicati perché dentro
// `.gc-dark` quelle custom properties sono ridefinite ai valori dark.
const PILL_BG = "#f5f0e8"; // --gc-bg light (cream)
const PILL_FG = "#123928"; // --gc-fg light (verde scuro testo)
const PILL_POS = "#2d8659"; // --gc-pos (invariato)
const PILL_NEG = "#c2553f"; // --gc-neg (invariato)
const PILL_NEUTRAL = "#94897a"; // --gc-fg-3 light

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

  const pillChangeColor =
    coin.change24h === null
      ? PILL_NEUTRAL
      : coin.change24h > 0
        ? PILL_POS
        : coin.change24h < 0
          ? PILL_NEG
          : PILL_NEUTRAL;

  return (
    <>
      {/* 1) Card espansa — full-main width, tema invertito (bosco),
          attaccata al top: `-mx-*` cancella il padding orizzontale del
          ProtectedShell main e `-mt-6` cancella il suo padding-top, così
          il blocco coin parte dal bordo superiore della colonna. */}
      <div className="gc-dark -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">
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
          className="block bg-gc-bg px-4 sm:px-6 lg:px-8 py-4 hover:bg-gc-bg-2 transition-colors">
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
          <footer className="mt-3 pt-3 border-t border-gc-line text-[11px] text-gc-fg-3 flex items-center gap-3">
            <div className="flex-1 min-w-0 truncate">
              {tLabels.rich("watchlist_count", {
                count: formatCompactCount(wlCount),
                strong: (chunks) => (
                  <span className="font-semibold text-gc-fg-2 tabular-nums">
                    {chunks}
                  </span>
                ),
              })}
            </div>
            {/* Mockup: feature reale non esiste ancora (no users.watchlist
                table). Inline button con `e.preventDefault()` per non
                seguire il Link parent. Sostituire con server-action quando
                la table arriva. */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gc-line-2 bg-gc-bg-2 px-3 py-1 text-[11px] font-medium text-gc-fg hover:bg-gc-bg-3 transition-colors"
            >
              <BookmarkPlus size={12} strokeWidth={1.75} />
              {tLabels("add_to_watchlist")}
            </button>
          </footer>
        </Link>
      </div>

      {/* 2) Sentinel */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {/* 3) Sticky bar — tema invertito, h-0 outer per zero reflow.
          Renderizzata SOLO quando `isStuck` è true: tenerla montata
          invisibile (pointer-events-none) lasciava un elemento absolute
          z-10 sopra il primo PostCard sotto, e in alcuni browser il
          primo click sulla card finiva "perso" su quell'overlay invece
          che sul Link stretched. Smontandola del tutto quando non
          serve, il click va dritto al post. Animazione di entrata via
          Tailwind animate-in (CSS pure, niente flag pending). */}
      {isStuck && (
        <div className="gc-dark sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 h-0">
          <Link
            href={href}
            prefetch={false}
            className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 border-b border-gc-line bg-gc-bg-2/90 text-gc-fg hover:bg-gc-bg-2 animate-in fade-in-0 slide-in-from-top-1 duration-150"
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
            {/* Pill beige: isola "light" dentro lo scope `.gc-dark` per
                garantire contrasto leggibile del prezzo e del segnale
                pos/neg sopra il verde scuro della bar. */}
            <span
              className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{ backgroundColor: PILL_BG, color: PILL_FG }}>
              <span className="text-sm font-semibold tabular-nums">
                {formatPrice(coin.price)}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: pillChangeColor }}>
                {formatChange(coin.change24h)}
              </span>
            </span>
            <ArrowUpRight
              size={14}
              strokeWidth={1.75}
              className="text-gc-fg-3 shrink-0"
              aria-hidden
            />
          </Link>
        </div>
      )}
    </>
  );
}
