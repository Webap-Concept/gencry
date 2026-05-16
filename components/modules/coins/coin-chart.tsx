"use client";

// components/modules/coins/coin-chart.tsx
// Grafico interattivo della pagina dettaglio coin. Recharts AreaChart con
// switcher finestre 1g/1w/1m/1y. SSR del range default (passato come
// `initialSeries`); il cambio range fetcha l'endpoint server-side cachato.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";
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

const RANGE_VALUES: HistoryRange[] = ["1d", "1w", "1m", "1y"];

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs < 0.01) return `$${value.toPrecision(4)}`;
  // Crypto convention: en-US format ovunque (1,234.56) — non locale-dipendente.
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAxisDate(ts: number, range: HistoryRange, locale: string): string {
  const d = new Date(ts);
  if (range === "1d") {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1y") {
    return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function formatTooltipDate(ts: number, range: HistoryRange, locale: string): string {
  const d = new Date(ts);
  if (range === "1d") {
    return d.toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(locale, {
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
  const locale = useLocale();
  const tLabels = useTranslations("prices.labels");
  const tRanges = useTranslations("prices.ranges");
  const tEmpty = useTranslations("prices.empty_states");
  const tSource = useTranslations("prices.source");
  // Recharts + SSR (Next 16/Turbopack): ResponsiveContainer misura -1
  // sul primo render server. Niente errore funzionale ma logga warning
  // costanti. Gate del rendering al post-mount client → SSR mostra lo
  // skeleton, dopo idratazione il chart compare.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      aria-label={tLabels("historical_chart_aria")}
      className="rounded-2xl bg-gc-bg-2 border border-gc-line p-4 sm:p-5"
    >
      {/* Header: switcher + nota sorgente */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div
          role="tablist"
          aria-label={tLabels("time_range_aria")}
          className="inline-flex rounded-full bg-gc-bg-3 border border-gc-line p-0.5"
        >
          {RANGE_VALUES.map((value) => {
            const active = value === series.range;
            return (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={active}
                disabled={isPending}
                onClick={() => handleRangeChange(value)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
                  active
                    ? "bg-gc-bg-2 text-gc-fg shadow-sm"
                    : "text-gc-fg-3 hover:text-gc-fg-2",
                  isPending && "opacity-60 cursor-wait",
                )}
              >
                {tRanges(value)}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-gc-fg-3">
          {tSource("label")}{" "}
          <a
            href="https://www.coingecko.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gc-fg-2 transition-colors"
          >
            {tSource("name")}
          </a>
        </span>
      </div>

      {/* Chart — height fissa: aspect-ratio a volte risolve a 0 al primo
          render (Recharts width=-1 warning), un'altezza esplicita evita
          il problema senza compromettere la responsiveness. */}
      <div className="w-full h-[280px] sm:h-[320px] md:h-[360px]">
        {series.points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-xs text-gc-fg-3">
            {tEmpty("no_history_window")}
          </div>
        ) : !mounted ? (
          // Skeleton SSR: stesso ingombro del chart, niente Recharts che
          // si lamenta del width=-1 finché non siamo client-side.
          <div className="h-full rounded-xl bg-gc-bg-3/50 animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                tickFormatter={(v) => formatAxisDate(v, series.range, locale)}
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
                labelFormatter={(v) => formatTooltipDate(Number(v), series.range, locale)}
                formatter={(v) => [formatPrice(Number(v)), tLabels("price")]}
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
