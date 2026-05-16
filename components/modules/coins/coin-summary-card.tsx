"use client";
// components/modules/coins/coin-summary-card.tsx
//
// Header informativo del feed /explore?ticker=<COIN>.
//
// Geometria — DUE ELEMENTI DOM SEPARATI, mai uno che cambia altezza:
//
//   1) "Card espansa"   → discussioni-card + CoinCard, SEMPRE in-flow,
//                         altezza costante. Visibile a inizio scroll,
//                         scrolla via normalmente.
//   2) "Sentinel"       → 1px in-flow, in mezzo. Osservato da
//                         `useIsStuck`; quando esce dal top dello scroll
//                         parent significa che l'utente è scrollato
//                         oltre la card espansa.
//   3) "Sticky bar"     → container `position: sticky`, height 0 in-flow
//                         (no reflow al flip). Bar absolute dentro,
//                         sempre montata, animata solo via opacity +
//                         transform → niente jank, niente "molla".
//
// Il pattern precedente (un singolo elemento sticky che cambiava forma
// tra "card espansa 200px" e "bar 40px") soffriva del classico bug
// sticky + altezza variabile: al flip lo scroll position rimbalzava e
// il sentinel rientrava in view, generando un loop oscillante visibile
// come "effetto molla" durante lo scroll. Separare i due elementi DOM
// fissa la cosa alla radice: il flow del documento non cambia mai.
//
// `-mx-4 sm:-mx-6 lg:-mx-8` sullo sticky outer per uscire dal padding
// orizzontale del ProtectedShell main → la bar tocca davvero i bordi.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoinView } from "@/lib/modules/prices/queries";
import { useIsStuck } from "@/lib/hooks/use-is-stuck";
import { CoinCard } from "./coin-card";
import { CoinIcon } from "./coin-icon";

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
  const href = `/coins/${coin.symbol.toLowerCase()}`;

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
      {/* 1) Card espansa — sempre in-flow, altezza fissa */}
      <div className="max-w-2xl mx-auto px-4">
        <div className="relative">
          <div
            className="relative z-0 rounded-2xl border border-gc-line bg-gc-bg-3 px-5 py-3 text-sm text-gc-fg-2"
            role="heading"
            aria-level={2}>
            {tExplore("discussions_about", { ticker: `$${coin.symbol}` })}
          </div>
          <CoinCard
            coin={coin}
            rank={coin.marketCapRank}
            href={href}
            className="relative z-10 -mt-3"
          />
        </div>
      </div>

      {/* 2) Sentinel — 1px, observed */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {/* 3) Sticky bar — h-0 outer, bar absolute inside.
          Outer è in flow MA con height 0, quindi il flip isStuck non
          provoca nessun reflow → no jitter. */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 h-0">
        <Link
          href={href}
          prefetch={false}
          aria-hidden={!isStuck}
          tabIndex={isStuck ? 0 : -1}
          className={`absolute inset-x-0 top-0 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 border-b border-gc-line bg-gc-bg-2/90 hover:bg-gc-bg-2 transition-[opacity,transform] duration-150 ease-out ${
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
