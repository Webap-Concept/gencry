"use client";
// components/modules/posts/TickerHoverCard.tsx
//
// Hover/long-press preview di un $TICKER inline nel PostBody. Pattern
// Twitter HoverCard + Bluesky long-press:
//   - Desktop (pointerType=mouse) → hover ~120ms apre, leave chiude
//   - Mobile  (pointerType=touch) → long-press 500ms apre il popover,
//                                   tap normale lascia navigare il Link
//
// Tre layer di freshness in cascata:
//   1. SSR prefetch via `initialData` (Server Components hanno già
//      caricato il batch dei ticker visibili → 0 latenza primo hover).
//   2. Cache modulo `previewCache` con `freshUntil` server-driven
//      (allineato al cron prices → cache scade quando il prossimo sync
//      è atteso, niente magic-constant TTL).
//   3. Lazy fetch via Server Action `getTickerPreview` come fallback
//      quando initialData è assente e cache vuota/stale.
//
// Refactor da Radix HoverCard a Popover (controlled): HoverCard non
// supporta nativamente touch long-press, Popover sì via open prop.
import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Popover as PopoverPrimitive } from "radix-ui";
import { ArrowUpRight, MessageCircle, TrendingUp } from "lucide-react";
import {
  getTickerPreview,
  type TickerPreviewData,
} from "@/lib/modules/posts/ticker-preview-actions";
import { CoinIcon } from "@/components/modules/coins/coin-icon";
import { MiniSparkline } from "@/components/modules/coins/mini-sparkline";

// Cache modulo (svuotata al refresh). { data, freshUntil } per entry —
// freshUntil è epoch ms, oltre quale la entry è stale.
type CacheEntry = TickerPreviewData;
const previewCache = new Map<string, CacheEntry>();

const HOVER_OPEN_DELAY_MS = 120;
const HOVER_CLOSE_DELAY_MS = 100;
const TOUCH_LONG_PRESS_MS = 500;

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() < entry.freshUntil;
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
  return `${sign}${value.toFixed(2)}%`;
}

type Props = {
  /** Simbolo UPPERCASE (es. "BTC"). */
  symbol: string;
  /** Preview pre-fetched server-side. Se presente E fresh → render
   *  immediato senza fetch al primo open. */
  initialData?: TickerPreviewData;
  /** Children = il `<Link>` `$TICKER` originale, wrappato come trigger. */
  children: React.ReactNode;
};

export function TickerHoverCard({ symbol, initialData, children }: Props) {
  const [open, setOpen] = React.useState(false);

  // Inizializza la cache modulo col prefetch SSR, se non già presente
  // o se quello in cache è più stale.
  React.useEffect(() => {
    if (!initialData) return;
    const cached = previewCache.get(symbol);
    if (!cached || cached.freshUntil < initialData.freshUntil) {
      previewCache.set(symbol, initialData);
    }
  }, [initialData, symbol]);

  const [data, setData] = React.useState<TickerPreviewData | null>(() => {
    const cached = previewCache.get(symbol);
    if (isFresh(cached)) return cached;
    if (initialData && isFresh(initialData)) {
      previewCache.set(symbol, initialData);
      return initialData;
    }
    return null;
  });
  const [loading, setLoading] = React.useState(false);

  // Refetch on open se data è null o stale.
  React.useEffect(() => {
    if (!open) return;
    if (isFresh(data ?? undefined)) return;
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

  // ── Hover (desktop mouse) — delay-based open/close ──────────────
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  React.useEffect(() => () => clearTimers(), []);

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimers();
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimers();
    closeTimerRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };
  const onContentPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimers();
    closeTimerRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };

  // ── Touch long-press (mobile) — 500ms tieni-premuto → apre ─────
  const touchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchOpenedRef = React.useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchOpenedRef.current = false;
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      touchOpenedRef.current = true;
      setOpen(true);
    }, TOUCH_LONG_PRESS_MS);
  };
  const cancelTouch = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };
  const onClick = (e: React.MouseEvent) => {
    // Se l'utente ha fatto long-press → blocca la navigation del Link
    // così resta sul popover. Tap normale → naviga (default).
    if (touchOpenedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      touchOpenedRef.current = false;
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <span
          onPointerEnter={onPointerEnter}
          onPointerLeave={(e) => {
            // Mouse leave: close-delay. Touch leave: cancel long-press.
            if (e.pointerType === "mouse") onPointerLeave(e);
            else cancelTouch(e);
          }}
          onPointerDown={onPointerDown}
          onPointerUp={cancelTouch}
          onPointerCancel={cancelTouch}
          onClick={onClick}
          className="inline-block">
          {children}
        </span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          sideOffset={6}
          align="center"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={() => clearTimers()}
          onPointerLeave={onContentPointerLeave}
          className="z-50 w-72 rounded-2xl border border-gc-line bg-gc-bg-2 p-4 shadow-xl">
          {data?.coin ? (
            <PreviewBody data={data} symbol={symbol} />
          ) : loading || !data ? (
            <PreviewSkeleton />
          ) : (
            <PreviewUntracked symbol={symbol} postCount={data.postCount24h} />
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
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
  const tHover = useTranslations("posts.ticker_hover");
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

      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-gc-fg tabular-nums">
            {formatPrice(coin.price)}
          </span>
          <span className={`text-xs tabular-nums ${changeTone}`}>
            {formatChange(coin.change24h)}{" "}
            <span className="text-gc-fg-3">24h</span>
          </span>
        </div>
        <MiniSparkline
          id={`hover-${coin.symbol}`}
          points={coin.weeklySparkline}
          width={100}
          height={32}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Link
          href={`/coins/${symbolLower}`}
          prefetch={false}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
          <ArrowUpRight size={13} strokeWidth={1.75} aria-hidden />
          {tHover("coin_page")}
        </Link>
        <Link
          href={`/explore?ticker=${symbol}`}
          prefetch={false}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
          <MessageCircle size={13} strokeWidth={1.75} aria-hidden />
          {data.postCount24h > 0
            ? tHover("posts_24h", { count: data.postCount24h })
            : tHover("see_all_posts")}
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
  const tHover = useTranslations("posts.ticker_hover");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-gc-fg-2">
        <TrendingUp
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="text-gc-fg-3"
        />
        <span>{tHover("untracked_message", { symbol: `$${symbol}` })}</span>
      </div>
      <Link
        href={`/explore?ticker=${symbol}`}
        prefetch={false}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gc-fg bg-gc-bg-3 hover:bg-gc-line transition-colors">
        <MessageCircle size={13} strokeWidth={1.75} aria-hidden />
        {postCount > 0
          ? tHover("posts_24h", { count: postCount })
          : tHover("see_all_posts")}
      </Link>
    </div>
  );
}
