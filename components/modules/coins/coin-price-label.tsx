// components/modules/coins/coin-price-label.tsx
// Prezzo formattato + variazione 24h colorata (pos/neg). Pure presentational.
import { cn } from "@/lib/utils";

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  // Sotto 0.01 (SHIB, PEPE…): 2 decimali fissi produrrebbe "$0.00" e
  // perderemmo l'info. Fallback a cifre significative.
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  // Tutto il resto: sempre 2 decimali con separatore migliaia.
  // BTC $79,637.42, ETH $3,123.45, DOGE $0.12.
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

export function CoinPriceLabel({
  price,
  change24h,
  size = "md",
  className,
}: {
  price: number;
  change24h: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const priceClass =
    size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-sm";
  const changeClass =
    size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[11px]";

  const changeTone =
    change24h === null
      ? "text-gc-fg-3"
      : change24h > 0
        ? "text-gc-pos"
        : change24h < 0
          ? "text-gc-neg"
          : "text-gc-fg-3";

  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <span className={cn(priceClass, "font-semibold text-gc-fg tabular-nums truncate")}>
        {formatPrice(price)}
      </span>
      <span className={cn(changeClass, "tabular-nums", changeTone)}>
        {formatChange(change24h)}
      </span>
    </div>
  );
}
