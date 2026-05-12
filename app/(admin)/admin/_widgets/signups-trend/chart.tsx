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
 * Compact 30-day signups vs unsubs area chart.
 *
 * Height NUMERICA (non "100%"): ResponsiveContainer con height="100%"
 * legge il parent via getBoundingClientRect e in certe race condition
 * (flex chain non ancora layouted, react-grid-layout edit mode, HMR)
 * legge 0/−1 → warning "width(-1) and height(-1)". Passandola fissa in
 * pixel saltiamo del tutto il measure verticale.
 *
 * Two series: signups in green (positive growth) and unsubs in red
 * (churn) — using accent (orange) for signups got visually confused
 * with the unsubs red on overlapping areas, so we picked a green that
 * also matches the "net positive" color in the widget header KPI.
 * Unsubs use lower opacity so they don't visually scream when sparse.
 */
const SIGNUPS_COLOR = "#16a34a";
const UNSUBS_COLOR = "#ef4444";
const CHART_HEIGHT = 180;
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
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <AreaChart
        data={[...data]}
        margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
      >
        <defs>
          <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SIGNUPS_COLOR} stopOpacity={0.45} />
            <stop offset="100%" stopColor={SIGNUPS_COLOR} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="unsubsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={UNSUBS_COLOR} stopOpacity={0.35} />
            <stop offset="100%" stopColor={UNSUBS_COLOR} stopOpacity={0.04} />
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
            stroke: SIGNUPS_COLOR,
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
          stroke={SIGNUPS_COLOR}
          strokeWidth={2}
          fill="url(#signupsFill)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="unsubs"
          stroke={UNSUBS_COLOR}
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
