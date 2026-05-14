// app/(admin)/admin/modules/prices/coins/[symbol]/_components/coin-detail-header.tsx
// Header del drill-down: icona + nome + symbol + chip rank + categoria
// + last sync timestamp.
import type { CoinView } from "@/lib/modules/prices/queries";
import Link from "next/link";

function formatCompactCurrency(value: number | null): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function CoinDetailHeader({ coin }: { coin: CoinView }) {
  return (
    <header
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start gap-4 flex-wrap">
        {coin.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coin.imageUrl}
            alt={`${coin.name} logo`}
            width={56}
            height={56}
            className="rounded-full shrink-0"
          />
        ) : (
          <div
            className="rounded-full shrink-0 flex items-center justify-center text-lg font-semibold"
            style={{
              width: 56,
              height: 56,
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-muted)",
            }}>
            {coin.symbol.charAt(0)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
              {coin.name}
            </h1>
            {typeof coin.marketCapRank === "number" && coin.marketCapRank > 0 && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono tabular-nums"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text-muted)",
                }}>
                #{coin.marketCapRank}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs font-mono" style={{ color: "var(--admin-text-faint)" }}>
            <span>{coin.symbol}</span>
            {coin.category && (
              <>
                <span aria-hidden>·</span>
                <span>{coin.category}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
                Last price
              </div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--admin-text)" }}>
                {formatPrice(coin.price)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
                24h
              </div>
              <div
                className="text-sm font-semibold tabular-nums"
                style={{
                  color:
                    coin.change24h === null
                      ? "var(--admin-text-muted)"
                      : coin.change24h > 0
                        ? "var(--admin-success, #16a34a)"
                        : coin.change24h < 0
                          ? "var(--admin-error, #dc2626)"
                          : "var(--admin-text-muted)",
                }}>
                {coin.change24h !== null
                  ? `${coin.change24h > 0 ? "+" : ""}${coin.change24h.toFixed(2)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
                Market cap
              </div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--admin-text)" }}>
                {formatCompactCurrency(coin.marketCap)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--admin-text-faint)" }}>
                Last sync
              </div>
              <div className="text-sm font-mono" style={{ color: "var(--admin-text-muted)" }}>
                {coin.lastUpdated.toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Link
            href={`/coins/${coin.symbol.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium underline"
            style={{ color: "var(--admin-accent)" }}>
            Apri pagina pubblica ↗
          </Link>
        </div>
      </div>
    </header>
  );
}
