"use client";

import { useLocale } from "next-intl";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Compact 30-day signups vs unsubs area chart. The parent widget
 * passes a fixed pixel height so ResponsiveContainer always has a
 * measurable parent on first paint (a percentage height inside a
 * flex chain can race the layout pass and read back -1×-1 from
 * getBoundingClientRect).
 *
 * Two series: signups in accent color (positive), unsubs in red at
 * lower opacity so they don't visually scream when sparse. The
 * widget reads as "shape of growth + shape of churn" — for exact
 * numbers users hover the tooltip.
 */
export interface SignupsTrendChartProps {
  data: ReadonlyArray<{ day: string; signups: number; unsubs: number }>;
}

export default function SignupsTrendChart({ data }: SignupsTrendChartProps) {
  const locale = useLocale();

  function formatXTick(value: string, index: number): string {
    if (index % 5 !== 0) return "";
    return formatShortDate(value, locale);
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={[...data]}
        margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
      >
        <defs>
          <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--admin-accent)"
              stopOpacity={0.45}
            />
            <stop
              offset="100%"
              stopColor="var(--admin-accent)"
              stopOpacity={0.05}
            />
          </linearGradient>
          <linearGradient id="unsubsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tickFormatter={formatXTick}
          tick={{ fontSize: 10, fill: "var(--admin-text-faint)" }}
          axisLine={false}
          tickLine={false}
          minTickGap={6}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--admin-text-faint)" }}
          axisLine={false}
          tickLine={false}
          width={30}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{
            stroke: "var(--admin-accent)",
            strokeWidth: 1,
            strokeDasharray: "3 3",
          }}
          contentStyle={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: 8,
            fontSize: 12,
            padding: "6px 10px",
          }}
          labelFormatter={(v) =>
            typeof v === "string" ? formatLongDate(v, locale) : ""
          }
        />
        {/* Order matters: signups first so unsubs (smaller usually)
            renders on top and stays visible. */}
        <Area
          type="monotone"
          dataKey="signups"
          stroke="var(--admin-accent)"
          strokeWidth={2}
          fill="url(#signupsFill)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="unsubs"
          stroke="#ef4444"
          strokeWidth={1.5}
          fill="url(#unsubsFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDayUtc(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function formatShortDate(yyyymmdd: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDayUtc(yyyymmdd));
}

function formatLongDate(yyyymmdd: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDayUtc(yyyymmdd));
}
