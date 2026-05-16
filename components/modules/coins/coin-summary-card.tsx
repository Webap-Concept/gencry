"use client";
// components/modules/coins/coin-summary-card.tsx
//
// Card riepilogativa di un coin, due stati visivi gestiti da CSS:
//
//   A. Espanso (default, in-flow) — banner "Discussioni su: $TICKER"
//      attaccato sopra + CoinCard (logo + nome + categoria + rank +
//      prezzo + change + sparkline + footer watchlist mock). Cliccabile
//      → /coins/<symbol>.
//   B. Stuck (allo scroll) — collapsed ticker bar full-width main: riga
//      unica con logo small + simbolo + prezzo + change 24h. Niente
//      sparkline, niente metadati secondari. Sfondo semi-trasparente +
//      backdrop-blur per leggibilità sopra al feed che scorre dietro.
//
// Il toggle tra A/B è guidato da `useIsStuck` che osserva un sentinel
// piazzato PRIMA del container sticky. Pattern zero-jank: 1 sola
// IntersectionObserver, niente scroll listener.
//
// Layout:
//   - Wrapper esterno `-mx-4 sm:-mx-6 lg:-mx-8` per uscire dal padding
//     orizzontale del ProtectedShell main. Solo così la sticky bar (stato
//     B) tocca davvero i bordi delle colonne laterali quando stuck.
//   - Stato A wrappato in `max-w-2xl mx-auto px-4`, stessa larghezza dei
//     post nel feed sotto: la card non risulta più "rimpicciolita" o
//     disallineata.
//
// Usato in /explore?ticker=BTC come header del feed filtrato.
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
  const symbolLower = coin.symbol.toLowerCase();
  const href = `/coins/${symbolLower}`;

  const changeTone =
    coin.change24h === null
      ? "text-gc-fg-3"
      : coin.change24h > 0
        ? "text-gc-pos"
        : coin.change24h < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    // Outer wrapper esce dal padding `px-4 sm:px-6 lg:px-8` del
    // ProtectedShell main, così la sticky bar full-width tocca davvero i
    // bordi.
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      {/* Sentinel: invisibile, height 1px. Quando esce dalla viewport
          il container sotto è "stuck". */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      <div className="sticky top-0 z-10">
        {isStuck ? (
          // ── Stato B: stuck coin bar full-main width ───────────────
          <Link
            href={href}
            prefetch={false}
            className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 border-b border-gc-line bg-gc-bg-2/90 hover:bg-gc-bg-2 transition-colors"
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
        ) : (
          // ── Stato A: banner "Discussioni su" + CoinCard espansa ───
          // Wrappata in max-w-2xl per allinearsi al feed sotto.
          <div className="max-w-2xl mx-auto px-4">
            <div
              className="rounded-t-2xl border border-b-0 border-gc-line bg-gc-bg-3 px-4 py-2 text-sm text-gc-fg-2"
              role="heading"
              aria-level={2}>
              {tExplore("discussions_about", { ticker: `$${coin.symbol}` })}
            </div>
            <CoinCard
              coin={coin}
              rank={coin.marketCapRank}
              href={href}
              className="rounded-t-none border-t-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
