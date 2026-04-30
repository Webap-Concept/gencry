// Sparkline procedurale: data deterministica generata dal ticker, così
// ogni coin ha sempre lo stesso "grafico" demo finché non plug-iniamo
// dati reali. Niente useMemo/state → server-component-friendly.

type SparkProps = {
  sym: string;
  /** Direzione del trend (positivo/negativo) — bias del random walk */
  change?: number;
  w?: number;
  h?: number;
  /** Override colore. Default: gc-pos / gc-neg in base a `change`. */
  color?: string;
};

function hashSeed(seed: string): number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return s;
}

function genSpark(seed: string, len = 24, trend = 0): number[] {
  let s = hashSeed(seed);
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0xffffff;
  };
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < len; i++) {
    v += (rand() - 0.5) * 14 + trend * 0.6;
    v = Math.max(10, Math.min(90, v));
    out.push(v);
  }
  return out;
}

export function Spark({ sym, change = 0, w = 80, h = 28, color }: SparkProps) {
  const pts = genSpark(sym, 24, change > 0 ? 1 : -1);
  const stroke = color || (change >= 0 ? "var(--gc-pos)" : "var(--gc-neg)");
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const norm = (v: number) =>
    h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
  const step = w / (pts.length - 1);
  const d = pts
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${(i * step).toFixed(2)},${norm(v).toFixed(2)}`
    )
    .join(" ");
  return (
    <svg width={w} height={h} className="block">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
