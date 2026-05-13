"use client";

// components/modules/coins/coin-chart.tsx
// Grafico interattivo della pagina dettaglio coin. Recharts AreaChart con
// switcher finestre 1g/1w/1m/1y. SSR del range default (passato come
// `initialSeries`); il cambio range fetcha l'endpoint server-side cachato.
import { useCallback, useId, useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { HistoryRange, HistorySeries } from "@/lib/modules/prices/queries";

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: "1d", label: "1g" },
  { value: "1w", label: "1w" },
  { value: "1m", label: "1m" },
  { value: "1y", label: "1y" },
];

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAxisDate(ts: number, range: HistoryRange): string {
  const d = new Date(ts);
  if (range === "1d") {
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1y") {
    return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function formatTooltipDate(ts: number, range: HistoryRange): string {
  const d = new Date(ts);
  if (range === "1d") {
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CoinChart({
  symbol,
  initialSeries,
}: {
  symbol: string;
  initialSeries: HistorySeries;
}) {
  const reactId = useId();
  const [series, setSeries] = useState<HistorySeries>(initialSeries);
  const [isPending, startTransition] = useTransition();

  const handleRangeChange = useCallback(
    (next: HistoryRange) => {
      if (next === series.range) return;
      startTransition(async () => {
        const res = await fetch(
          `/api/modules/prices/${symbol.toLowerCase()}/history?range=${next}`,
          { cache: "default" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as HistorySeries;
        setSeries(data);
      });
    },
    [series.range, symbol],
  );

  // Calcola il trend (primo vs ultimo punto) per colorare l'area.
  const stroke = useMemo(() => {
    if (series.points.length < 2) return "var(--gc-fg-3)";
    const first = series.points[0].price;
    const last = series.points[series.points.length - 1].price;
    const delta = (last - first) / Math.max(Math.abs(first), 1e-12);
    if (delta > 0.001) return "var(--gc-pos)";
    if (delta < -0.001) return "var(--gc-neg)";
    return "var(--gc-fg-3)";
  }, [series.points]);

  const gradientId = `coin-chart-grad-${reactId.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <section
      aria-label="Grafico storico prezzo"
      className="rounded-2xl bg-gc-bg-2 border border-gc-line p-4 sm:p-5"
    >
      {/* Header: switcher + nota sorgente */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div
          role="tablist"
          aria-label="Intervallo temporale"
          className="inline-flex rounded-full bg-gc-bg-3 border border-gc-line p-0.5"
        >
          {RANGES.map((r) => {
            const active = r.value === series.range;
            return (
              <button
                key={r.value}
                role="tab"
                type="button"
                aria-selected={active}
                disabled={isPending}
                onClick={() => handleRangeChange(r.value)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
                  active
                    ? "bg-gc-bg-2 text-gc-fg shadow-sm"
                    : "text-gc-fg-3 hover:text-gc-fg-2",
                  isPending && "opacity-60 cursor-wait",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-gc-fg-3">
          Source:{" "}
          <a
            href="https://www.coingecko.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gc-fg-2 transition-colors"
          >
            CoinGecko
          </a>
        </span>
      </div>

      {/* Chart — height fissa: aspect-ratio a volte risolve a 0 al primo
          render (Recharts width=-1 warning), un'altezza esplicita evita
          il problema senza compromettere la responsiveness. */}
      <div className="w-full h-[280px] sm:h-[320px] md:h-[360px]">
        {series.points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-xs text-gc-fg-3">
            Storico non ancora disponibile per questa finestra.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series.points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => formatAxisDate(v, series.range)}
                stroke="var(--gc-fg-3)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                dataKey="price"
                domain={["auto", "auto"]}
                tickFormatter={(v) => formatPrice(v)}
                stroke="var(--gc-fg-3)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={64}
                orientation="right"
              />
              <Tooltip
                cursor={{ stroke: "var(--gc-line-2)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--gc-modal-bg)",
                  border: "1px solid var(--gc-modal-border)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "var(--gc-fg)",
                }}
                labelFormatter={(v) => formatTooltipDate(Number(v), series.range)}
                formatter={(v) => [formatPrice(Number(v)), "Prezzo"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                isAnimationActive
                animationDuration={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
