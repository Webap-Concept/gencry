"use client";
// components/modules/posts/TickerHoverCard.tsx
//
// Hover preview di un $TICKER inline nel PostBody. Pattern Twitter
// HoverCard: su desktop il hover apre un floating panel con coin
// snapshot + 2-3 CTA; su mobile (no hover) il Link interno resta
// cliccabile e va a /coins/<symbol>.
//
// La preview è fetched lazy via Server Action al primo open. Cache
// in-memory per evitare N+1 quando lo stesso ticker compare in
// più post visibili nella stessa pagina.
import * as React from "react";
import Link from "next/link";
import { HoverCard as HoverCardPrimitive } from "radix-ui";
import { ArrowUpRight, MessageCircle, TrendingUp } from "lucide-react";
import {
  getTickerPreview,
  type TickerPreviewData,
} from "@/lib/modules/posts/ticker-preview-actions";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { MiniSparkline } from "@/components/modules/coins/mini-sparkline";

// Cache locale al modulo (svuotata al refresh pagina). Evita
// re-fetch quando lo stesso $TICKER è linkato in più post.
const previewCache = new Map<string, TickerPreviewData>();

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

type Props = {
  /** Simbolo UPPERCASE (es. "BTC"). */
  symbol: string;
  /** Children = il `<Link>` `$TICKER` originale, wrappato come trigger. */
  children: React.ReactNode;
};

export function TickerHoverCard({ symbol, children }: Props) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<TickerPreviewData | null>(
    previewCache.get(symbol) ?? null,
  );
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await getTickerPreview(symbol);
      if (cancelled) return;
      if (res.ok) {
        previewCache.set(symbol, res.data);
        setData(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data, symbol]);

  return (
    <HoverCardPrimitive.Root
      openDelay={250}
      closeDelay={100}
      onOpenChange={setOpen}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="top"
          sideOffset={6}
          className="z-50 w-72 rounded-2xl border border-gc-line bg-gc-bg-2 p-4 shadow-xl"
          style={{
            // Animation soft (Radix data attrs gestiscono open/close).
            animation: "fadeInUp 120ms ease-out",
          }}>
          {data?.coin ? (
            <PreviewBody data={data} symbol={symbol} />
          ) : loading || !data ? (
            <PreviewSkeleton />
          ) : (
            <PreviewUntracked symbol={symbol} postCount={data.postCount24h} />
          )}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

function PreviewBody({
  data,
  symbol,
}: {
  data: TickerPreviewData;
  symbol: string;
}) {
  const coin = data.coin!;
  const symbolLower = coin.symbol.toLowerCase();
  const changeTone =
    coin.change24h === null
      ? "text-gc-fg-3"
      : coin.change24h > 0
        ? "text-gc-pos"
        : coin.change24h < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    <div className="flex flex-col gap-3">
      {/* Header: logo + name + symbol + rank */}
      <div className="flex items-start gap-2.5">
        <CoinIcon
          symbol={coin.symbol}
          name={coin.name}
          imageUrl={coin.imageUrl}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gc-fg truncate">
            {coin.name}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-gc-fg-3">
            ${coin.symbol}
            {typeof coin.marketCapRank === "number" && coin.marketCapRank > 0
              ? ` · #${coin.marketCapRank}`
              : ""}
          </div>
        </div>
      </div>

      {/* Price + change + sparkline */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-gc-fg tabular-nums">
            {formatPrice(coin.price)}
          </span>
          <span className={`text-xs tabular-nums ${changeTone}`}>
            {formatChange(coin.change24h)} <span className="text-gc-fg-3">24h</span>
          </span>
        </div>
        <MiniSparkline
          id={`hover-${coin.symbol}`}
          points={coin.weeklySparkline}
          width={100}
          height={32}
        />
      </div>

      {/* CTA */}
      <div className="flex flex-col gap-1.5">
        <Link
          href={`/coins/${symbolLower}`}
          prefetch={false}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
          <ArrowUpRight size={13} strokeWidth={1.75} aria-hidden />
          Pagina coin
        </Link>
        <Link
          href={`/explore?ticker=${symbol}`}
          prefetch={false}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
          <MessageCircle size={13} strokeWidth={1.75} aria-hidden />
          {data.postCount24h > 0
            ? `${data.postCount24h} post 24h · vedi tutti`
            : "Vedi tutti i post"}
        </Link>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gc-bg-3" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-gc-bg-3" />
          <div className="h-2.5 w-16 rounded bg-gc-bg-3" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <div className="h-5 w-20 rounded bg-gc-bg-3" />
          <div className="h-2.5 w-14 rounded bg-gc-bg-3" />
        </div>
        <div className="h-8 w-24 rounded bg-gc-bg-3" />
      </div>
      <div className="h-7 w-full rounded-lg bg-gc-bg-3" />
    </div>
  );
}

function PreviewUntracked({
  symbol,
  postCount,
}: {
  symbol: string;
  postCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-gc-fg-2">
        <TrendingUp size={14} strokeWidth={1.75} aria-hidden className="text-gc-fg-3" />
        <span>
          <strong className="text-gc-fg">${symbol}</strong> non è tracciato
          nel modulo prezzi.
        </span>
      </div>
      <Link
        href={`/explore?ticker=${symbol}`}
        prefetch={false}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
        <MessageCircle size={13} strokeWidth={1.75} aria-hidden />
        {postCount > 0
          ? `${postCount} post 24h · vedi tutti`
          : "Vedi tutti i post"}
      </Link>
    </div>
  );
}
