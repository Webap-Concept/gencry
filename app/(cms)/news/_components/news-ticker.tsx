// app/(cms)/news/_components/news-ticker.tsx
//
// Live coin ticker mostrato sotto l'header sulla home blog. Layout:
//
//   [LIVE · MERCATI  |  TRACK ANIMATO ──────────────────────→ ]
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                       overflow-hidden, scroll infinito CSS
//
// La label è fissa a sinistra (flex-shrink:0). Il track scorre in loop
// seamless: il contenuto è duplicato (coins × 2) e l'animazione trasla
// di -50% — quando finisce la prima metà, il puntatore "salta" al
// duplicato senza visible jump.
//
// Mobile: nessun overflow-x sulla pagina (il vecchio grid `auto repeat(N,
// 1fr)` sforava perché le colonne non shrinkavano). Qui il track ha
// `min-width: 0` e l'animazione lavora su elementi a width naturale.

import Link from "next/link";
import { getTopCoinsForCards } from "@/lib/modules/prices/queries";

const TICKER_TOP_N = 20;

/**
 * Background fallback per coin senza icona — riusa una palette stabile
 * derivata dal symbol. Niente colori casuali (renderebbero la pagina
 * "instabile" tra render).
 */
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

function TickItem({ c, ariaHidden = false }: { c: Coin; ariaHidden?: boolean }) {
  const pos = (c.change24h ?? 0) >= 0;
  return (
    <Link
      href={`/coins/${c.symbol.toLowerCase()}`}
      prefetch={false}
      className="news-tick"
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
    >
      <span
        className="news-tick-mark"
        style={
          // Background colorato SOLO se manca l'icona vera: con
          // un'icona R2 trasparente (PNG/SVG) il bg arancio si
          // vede attraverso e fa pasticcio visivo.
          c.imageUrl ? undefined : { background: fallbackBg(c.symbol) }
        }
      >
        {c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt="" />
        ) : (
          c.symbol.slice(0, 1)
        )}
      </span>
      <span className="news-tick-meta">
        <span className="news-tick-sym">{c.symbol}</span>
      </span>
      <span className="news-tick-vals">
        <span className="news-tick-price">{formatPrice(c.price)}</span>
        <span className={`news-tick-change ${pos ? "news-pos" : "news-neg"}`}>
          {formatChange(c.change24h)}
        </span>
      </span>
    </Link>
  );
}

export async function NewsTicker() {
  const coins = await getTopCoinsForCards(TICKER_TOP_N);
  if (coins.length === 0) return null;

  return (
    <div className="news-ticker">
      <div className="news-container news-ticker-inner">
        <div className="news-ticker-label">
          <span className="news-live-dot" />
          <em>Live</em>
          <span>Mercati</span>
        </div>
        <div className="news-ticker-viewport">
          {/* Track duplicato: due copie consecutive del set di coin.
              L'animazione trasla -50% del track-width → quando la
              prima metà esce, il puntatore torna a 0 e mostra la
              seconda metà esattamente come il punto di partenza. */}
          <div className="news-ticker-track">
            {coins.map((c) => (
              <TickItem key={`a-${c.symbol}`} c={c} />
            ))}
            {coins.map((c) => (
              <TickItem key={`b-${c.symbol}`} c={c} ariaHidden />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
