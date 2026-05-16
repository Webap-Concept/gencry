// components/modules/coins/mini-sparkline.tsx
// Mini-grafico SVG hand-made: 21 punti settimanali, no Recharts.
// Pure presentational — il colore (pos/neg) deriva dalla differenza tra
// primo e ultimo punto, NON da change24h (che misura un periodo diverso:
// ultimo prezzo vs 24h fa, mentre la sparkline copre 7gg).
import { cn } from "@/lib/utils";

// Counter modulo-local per assicurare id <linearGradient> unici quando N
// sparkline sono renderizzate sulla stessa pagina senza prop `id`. Il
// componente è server-side, quindi il counter incrementa una volta per
// render-tree. Per usi più rigorosi (hydration warnings su pagine miste)
// il consumer può passare `id` esplicito (es. coin.symbol).
let _gradientCounter = 0;

type Trend = "up" | "down" | "flat";

function computeTrend(points: number[]): Trend {
  if (points.length < 2) return "flat";
  const first = points[0];
  const last = points[points.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "flat";
  const delta = (last - first) / Math.max(Math.abs(first), 1e-12);
  if (delta > 0.001) return "up";
  if (delta < -0.001) return "down";
  return "flat";
}

export function MiniSparkline({
  points,
  width = 120,
  height = 40,
  className,
  id,
  ariaLabel,
}: {
  points: number[] | null;
  width?: number;
  height?: number;
  className?: string;
  /** Id usato per il <linearGradient>. Deve essere unico nella pagina.
   *  Se omesso, viene auto-generato da un counter modulo-local. */
  id?: string;
  /**
   * Aria-label tradotto, passato dal caller. Il componente è SSR-statico
   * + usato da client components → non può chiamare `useTranslations` né
   * essere `async`. Il caller traduce e passa la stringa. Default fallback
   * non localizzato per backward-compat.
   */
  ariaLabel?: string;
}) {
  if (!points || points.length < 2) {
    return (
      <div
        className={cn("flex items-center justify-center text-gc-fg-3 text-[10px]", className)}
        style={{ width, height }}
        aria-hidden>
        —
      </div>
    );
  }

  const trend = computeTrend(points);
  const stroke =
    trend === "up"
      ? "var(--gc-pos)"
      : trend === "down"
        ? "var(--gc-neg)"
        : "var(--gc-fg-3)";

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  // Padding interno per evitare che lo stroke tocchi i bordi
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height} L ${coords[0].x.toFixed(2)} ${height} Z`;

  const gradientId = id
    ? `spark-grad-${id}`
    : `spark-grad-${++_gradientCounter}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? "7-day price trend"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
