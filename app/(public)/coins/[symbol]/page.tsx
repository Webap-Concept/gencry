import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, BookmarkPlus, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CoinChart,
  CoinIcon,
  CoinPriceLabel,
  MiniSparkline,
  formatCompactCount,
  mockWatchlistCount,
} from "@/components/modules/coins";
import { getSession } from "@/lib/auth/session";
import { getCoinForCard, getHistorySeries } from "@/lib/modules/prices/queries";
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
  const [coin, session, initialSeries] = await Promise.all([
    getCoinForCard(symbol),
    getSession(),
    // SSR del range default "1w" — il client può switchare a 1d/1m/1y
    // chiamando l'endpoint /api/modules/prices/<symbol>/history.
    getHistorySeries(symbol, "1w"),
  ]);
  if (!coin) notFound();

  const isAuthed = Boolean(session);

  return (
    <>
      {isAuthed && (
        <Link
          href="/explore"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-xs text-gc-fg-3 hover:text-gc-fg-2 transition-colors"
        >
          <ArrowLeft size={14} />
          Esplora
        </Link>
      )}
      <CoinHeader coin={coin} actions={<HeaderActions isAuthed={isAuthed} />} />
      <CoinChart symbol={coin.symbol} initialSeries={initialSeries} />
      <StatsGrid coin={coin} />
      {isAuthed ? (
        <AuthedActionsRow />
      ) : (
        <AnonymousCta coinName={coin.name} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function CoinHeader({
  coin,
  actions,
}: {
  coin: CoinView;
  actions?: React.ReactNode;
}) {
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
      <div className="flex flex-col items-end gap-3">
        <MiniSparkline
          id={coin.symbol}
          points={coin.weeklySparkline}
          width={180}
          height={60}
        />
        {actions}
      </div>
    </header>
  );
}

function HeaderActions({ isAuthed }: { isAuthed: boolean }) {
  if (!isAuthed) return null;
  // Placeholder finché le feature reali non esistono. Disabled per non
  // fingere interattività; reso visibile per dare anteprima visiva.
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled>
        <BookmarkPlus size={14} />
        Watchlist
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled aria-label="Condividi">
        <Share2 size={14} />
      </Button>
    </div>
  );
}

function AuthedActionsRow() {
  return (
    <section className="rounded-2xl p-4 bg-gc-bg-2 border border-gc-line text-xs text-gc-fg-3">
      Commenti, sentiment e watchlist arrivano con i prossimi moduli social.
    </section>
  );
}

function AnonymousCta({ coinName }: { coinName: string }) {
  return (
    <section className="rounded-2xl p-5 bg-gc-bg-2 border border-gc-line flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-gc-fg">
          Segui {coinName} sulla community
        </h2>
        <p className="text-xs text-gc-fg-3 mt-1">
          Iscriviti per aggiungere {coinName} alla tua watchlist, ricevere
          alert e leggere cosa pensa la community.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in" prefetch={false}>
            Accedi
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up" prefetch={false}>
            <MessageCircle size={14} />
            Iscriviti
          </Link>
        </Button>
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
