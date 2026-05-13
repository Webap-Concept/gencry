// components/modules/coins/coin-price-label.tsx
// Prezzo formattato + variazione 24h colorata (pos/neg). Pure presentational.
import { cn } from "@/lib/utils";

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  // Coin "frazionari" (es. SHIB): più decimali per non mostrare 0
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  if (abs < 1) return `$${value.toFixed(4)}`;
  if (abs < 100) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
