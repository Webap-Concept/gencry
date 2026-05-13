import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import {
  CoinIcon,
  CoinPriceLabel,
  MiniSparkline,
  formatCompactCount,
  mockWatchlistCount,
} from "@/components/modules/coins";
import { getCoinForCard } from "@/lib/modules/prices/queries";
import type { CoinView } from "@/lib/modules/prices/queries";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const coin = await getCoinForCard(symbol);
  if (!coin) return { title: "Coin non trovato" };
  return { title: `${coin.name} (${coin.symbol})` };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoinDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        href="/explore"
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
      >
        <ArrowLeft size={14} />
        Esplora
      </Link>

      <Suspense fallback={<CoinDetailSkeleton />}>
        <CoinDetailBody params={params} />
      </Suspense>
    </div>
  );
}

async function CoinDetailBody({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const coin = await getCoinForCard(symbol);
  if (!coin) notFound();

  return (
    <>
      <CoinHeader coin={coin} />
      <ChartPlaceholder />
      <StatsGrid coin={coin} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function CoinHeader({ coin }: { coin: CoinView }) {
  return (
    <header className="flex items-start gap-4 flex-wrap">
      <CoinIcon symbol={coin.symbol} imageUrl={coin.imageUrl} size="xl" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-gc-fg">{coin.name}</h1>
          {typeof coin.marketCapRank === "number" && coin.marketCapRank > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gc-bg-3 border border-gc-line text-gc-fg-2 tabular-nums">
              #{coin.marketCapRank}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gc-fg-3 mt-1">
          <span className="uppercase tracking-wide">{coin.symbol}</span>
          {coin.category && (
            <>
              <span aria-hidden>·</span>
              <span>{coin.category}</span>
            </>
          )}
        </div>
        <div className="mt-4">
          <CoinPriceLabel
            price={coin.price}
            change24h={coin.change24h}
            size="lg"
          />
        </div>
      </div>
      <MiniSparkline
        id={coin.symbol}
        points={coin.weeklySparkline}
        width={180}
        height={60}
      />
    </header>
  );
}

function ChartPlaceholder() {
  return (
    <section
      aria-label="Grafico interattivo (in arrivo)"
      className="rounded-2xl bg-gc-bg-2 border border-dashed border-gc-line aspect-[16/7] flex items-center justify-center"
    >
      <div className="text-center px-6">
        <p className="text-sm font-semibold text-gc-fg-2">
          Grafico interattivo
        </p>
        <p className="text-xs text-gc-fg-3 mt-1">
          In arrivo — visualizzazione completa con finestre 1g / 1w / 1m / 1y.
        </p>
      </div>
    </section>
  );
}

function StatsGrid({ coin }: { coin: CoinView }) {
  const watchlistCount = mockWatchlistCount(coin.symbol);
  return (
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <Stat
        label="Market cap"
        value={coin.marketCap !== null ? formatCompactCurrency(coin.marketCap) : "—"}
      />
      <Stat
        label="Volume 24h"
        value={coin.volume24h !== null ? formatCompactCurrency(coin.volume24h) : "—"}
      />
      <Stat
        label="Posizione"
        value={
          typeof coin.marketCapRank === "number" && coin.marketCapRank > 0
            ? `#${coin.marketCapRank}`
            : "—"
        }
      />
      <Stat
        label="In watchlist"
        value={formatCompactCount(watchlistCount)}
        hint="mockup"
      />
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl p-3 bg-gc-bg-2 border border-gc-line">
      <div className="text-[11px] uppercase tracking-wide text-gc-fg-3">
        {label}
        {hint && (
          <span className="ml-1 normal-case tracking-normal text-gc-fg-3/70">
            ({hint})
          </span>
        )}
      </div>
      <div className="text-sm font-semibold text-gc-fg mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CoinDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-full bg-gc-bg-3" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-6 w-40 rounded bg-gc-bg-3" />
          <div className="h-3 w-24 rounded bg-gc-bg-3" />
          <div className="h-8 w-32 rounded bg-gc-bg-3 mt-4" />
        </div>
        <div className="w-[180px] h-[60px] rounded bg-gc-bg-3" />
      </div>
      <div className="rounded-2xl bg-gc-bg-2 border border-dashed border-gc-line aspect-[16/7]" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-3 bg-gc-bg-2 border border-gc-line space-y-2"
          >
            <div className="h-2 w-16 rounded bg-gc-bg-3" />
            <div className="h-4 w-20 rounded bg-gc-bg-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
