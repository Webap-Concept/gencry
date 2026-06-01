// components/modules/coins/top-coins-bar.tsx
//
// Barra fissa full-width in cima allo shell loggato con le top coin by
// market cap. Comportamento (decisione UX 2026-06-01):
//   - Desktop (md+): BTC + ETH SEMPRE FISSI a sinistra; le altre coin
//     scorrono in marquee automatico infinito (CSS, niente scrollbar).
//   - Mobile (<md): SOLO BTC + ETH, centrati e ben spaziati. Niente
//     marquee, niente altre coin.
//
// La barra sta fuori dal <main> scrollabile dello shell → resta fissa
// verticalmente senza position:fixed. Iniettata nello slot `marketBar`
// di ProtectedShell, guardata da isModuleInstalled("prices") → core
// module-agnostic. Dati: getTopCoinsForCards (cache Redis), stessa fonte
// del ticker news.
import Link from "next/link";
import { getTopCoinsForCards } from "@/lib/modules/prices/queries";

// Quante coin caricare per il marquee (oltre a BTC/ETH fissi).
const TOP_N = 24;
const PINNED = ["BTC", "ETH"] as const;

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

function TickItem({
  c,
  bordered = true,
  ariaHidden = false,
}: {
  c: Coin;
  /** Separatore destro: true per pinned/marquee, false per i due item
   *  centrati su mobile. */
  bordered?: boolean;
  ariaHidden?: boolean;
}) {
  const pos = (c.change24h ?? 0) >= 0;
  return (
    <Link
      href={`/coins/${c.symbol.toLowerCase()}`}
      prefetch={false}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      className={`flex shrink-0 items-center gap-2.5 px-4 py-2 transition-colors hover:bg-gc-bg-3 ${
        bordered ? "border-r border-gc-line" : ""
      }`}
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

  // BTC + ETH fissi (nell'ordine di PINNED, se tracciati); il resto scorre.
  const bySymbol = new Map(coins.map((c) => [c.symbol.toUpperCase(), c]));
  const pinned = PINNED.map((s) => bySymbol.get(s)).filter(
    (c): c is Coin => Boolean(c),
  );
  const pinnedSet = new Set(pinned.map((c) => c.symbol.toUpperCase()));
  const rest = coins.filter((c) => !pinnedSet.has(c.symbol.toUpperCase()));

  // Velocità marquee costante a vista: ~3s per coin (min 30s).
  const durationS = Math.max(rest.length * 3, 30);

  return (
    <div className="border-b border-gc-line bg-gc-bg-2">
      {/* MOBILE: solo BTC + ETH, centrati e spaziati. */}
      <div className="flex items-center justify-center gap-10 py-1.5 md:hidden">
        {pinned.map((c) => (
          <TickItem key={c.symbol} c={c} bordered={false} />
        ))}
      </div>

      {/* DESKTOP: BTC + ETH fissi a sinistra, il resto in marquee. */}
      <div className="hidden items-stretch md:flex">
        <div className="flex shrink-0 border-r border-gc-line">
          {pinned.map((c) => (
            <TickItem key={c.symbol} c={c} />
          ))}
        </div>
        {rest.length > 0 ? (
          <div
            className="gc-marquee-viewport min-w-0 flex-1 overflow-hidden"
            style={{
              // Fade ai bordi del track scorrevole (non sui pinned).
              maskImage:
                "linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 40px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 40px), transparent 100%)",
            }}
          >
            {/* Track con 2 copie consecutive → loop seamless. */}
            <div
              className="gc-marquee-track"
              style={{ animationDuration: `${durationS}s` }}
            >
              {rest.map((c) => (
                <TickItem key={`a-${c.symbol}`} c={c} />
              ))}
              {rest.map((c) => (
                <TickItem key={`b-${c.symbol}`} c={c} ariaHidden />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Skeleton per il Suspense fallback: stessa altezza così niente layout shift. */
export function TopCoinsBarSkeleton() {
  return (
    <div className="border-b border-gc-line bg-gc-bg-2" aria-hidden>
      {/* Mobile */}
      <div className="flex items-center justify-center gap-10 py-1.5 md:hidden">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 py-2">
            <div className="h-[26px] w-[26px] rounded-[7px] bg-gc-bg-3" />
            <div className="h-3 w-10 rounded bg-gc-bg-3" />
          </div>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden items-stretch md:flex">
        {Array.from({ length: 10 }).map((_, i) => (
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
  );
}
