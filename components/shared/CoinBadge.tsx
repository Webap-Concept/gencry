type CoinBadgeProps = {
  sym: string;
  size?: number;
};

export function CoinBadge({ sym, size = 32 }: CoinBadgeProps) {
  // Ticker lunghi (es. PEPE → PEP) vengono troncati per restare leggibili nel cerchio.
  const label = sym.length > 4 ? sym.slice(0, 3) : sym;
  return (
    <div
      className="inline-flex items-center justify-center rounded-full bg-gc-bg border border-gc-line text-gc-fg font-mono font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.28),
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </div>
  );
}
