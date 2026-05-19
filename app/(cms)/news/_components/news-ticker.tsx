// app/(cms)/news/_components/news-ticker.tsx
//
// Live coin ticker mostrato sotto l'header sulla home blog. Dati reali
// dal modulo prices (top 6 per market cap). Lascia il mockup-style del
// design (colori per coin, prima lettera o icona) ma con dati onchain.

import Link from "next/link";
import { getTopCoinsForCards } from "@/lib/modules/prices/queries";

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

export async function NewsTicker() {
  const coins = await getTopCoinsForCards(6);
  if (coins.length === 0) return null;

  return (
    <div className="news-ticker">
      <div className="news-container news-ticker-inner">
        <div className="news-ticker-label">
          <span className="news-live-dot" />
          <em>Live</em>
          <span>Mercati</span>
        </div>
        {coins.map((c) => {
          const pos = (c.change24h ?? 0) >= 0;
          return (
            <Link
              key={c.symbol}
              href={`/coins/${c.symbol.toLowerCase()}`}
              prefetch={false}
              className="news-tick"
            >
              <span
                className="news-tick-mark"
                style={{ background: fallbackBg(c.symbol) }}
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
                <span className="news-tick-name">{c.name}</span>
              </span>
              <span className="news-tick-vals">
                <span className="news-tick-price">{formatPrice(c.price)}</span>
                <span className={`news-tick-change ${pos ? "news-pos" : "news-neg"}`}>
                  {formatChange(c.change24h)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
