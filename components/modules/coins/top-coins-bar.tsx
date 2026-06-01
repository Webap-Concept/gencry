// components/modules/coins/top-coins-bar.tsx
//
// Barra fissa full-width in cima allo shell loggato che mostra le top N
// coin by market cap. Stessa grafica del ticker news (icona + symbol +
// prezzo + var%), ma NON animata: la barra è fissa (sta fuori dal <main>
// scrollabile dello shell) e su overflow le coin si scrollano a mano in
// orizzontale (decisione UX 2026-06-01).
//
// Iniettata nello slot `marketBar` di ProtectedShell dal layout (protected)
// + PublicAdaptiveShell, guardata da isModuleInstalled("prices") → il core
// resta module-agnostic.
//
// Dati: getTopCoinsForCards(N) è già cache Redis (hot) + React.cache per
// request → costo trascurabile anche se lo shell ri-renderizza a ogni
// navigazione. Wrappare in <Suspense> lato chiamante per non bloccare il
// primo paint.
import Link from "next/link";
import { getTopCoinsForCards } from "@/lib/modules/prices/queries";

const TOP_N = 24;

// Palette fallback stabile per coin senza icona (no random → render stabile).
const COIN_FALLBACK_BG: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#4b6fbf",
  SOL: "#fa8b1e",
  BNB: "#f0b90b",
  XRP: "#23292f",
  DOGE: "#c2a633",
  ADA: "#0033ad",
  AVAX: "#e84142",
  TON: "#0098ea",
  SUI: "#4ca2ff",
};
function fallbackBg(symbol: string): string {
  return COIN_FALLBACK_BG[symbol.toUpperCase()] ?? "var(--gc-fg-2)";
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  return `$${value.toPrecision(3)}`;
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

type Coin = Awaited<ReturnType<typeof getTopCoinsForCards>>[number];

function TickItem({ c }: { c: Coin }) {
  const pos = (c.change24h ?? 0) >= 0;
  return (
    <Link
      href={`/coins/${c.symbol.toLowerCase()}`}
      prefetch={false}
      className="flex shrink-0 items-center gap-2.5 border-r border-gc-line px-4 py-2 transition-colors hover:bg-gc-bg-3"
    >
      <span
        className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] font-display text-sm italic leading-none text-white"
        style={c.imageUrl ? undefined : { background: fallbackBg(c.symbol) }}
      >
        {c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          c.symbol.slice(0, 1)
        )}
      </span>
      <span className="font-mono text-[11px] font-medium tracking-wide text-gc-fg">
        {c.symbol}
      </span>
      <span className="ml-1 text-right leading-tight">
        <span className="block font-mono text-[12.5px] font-medium tabular-nums text-gc-fg">
          {formatPrice(c.price)}
        </span>
        <span
          className={`block font-mono text-[11px] tabular-nums ${
            pos ? "text-gc-pos" : "text-gc-neg"
          }`}
        >
          {formatChange(c.change24h)}
        </span>
      </span>
    </Link>
  );
}

export async function TopCoinsBar() {
  const coins = await getTopCoinsForCards(TOP_N);
  if (coins.length === 0) return null;

  return (
    <div className="border-b border-gc-line bg-gc-bg-2">
      <div className="flex items-stretch">
        {/* Label fissa a sinistra */}
        <div className="flex shrink-0 items-center gap-2 border-r border-gc-line pr-4 pl-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gc-fg-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gc-green" />
          <em className="font-display text-[14px] italic text-gc-accent">
            Live
          </em>
          <span className="hidden sm:inline">Mercati</span>
        </div>
        {/* Track scrollabile a mano (niente animazione marquee). */}
        <div className="flex flex-1 overflow-x-auto [scrollbar-width:thin]">
          {coins.map((c) => (
            <TickItem key={c.symbol} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton per il Suspense fallback: stessa altezza così niente layout shift. */
export function TopCoinsBarSkeleton() {
  return (
    <div className="border-b border-gc-line bg-gc-bg-2" aria-hidden>
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-gc-line px-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gc-fg-3">
          <span className="h-1.5 w-1.5 rounded-full bg-gc-green/50" />
          <em className="font-display text-[14px] not-italic text-gc-accent/60">
            Live
          </em>
          <span className="hidden sm:inline">Mercati</span>
        </div>
        <div className="flex flex-1 gap-0 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex shrink-0 items-center gap-2.5 border-r border-gc-line px-4 py-2"
            >
              <div className="h-[26px] w-[26px] rounded-[7px] bg-gc-bg-3" />
              <div className="h-3 w-10 rounded bg-gc-bg-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
