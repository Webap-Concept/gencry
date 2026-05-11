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
 * Compact 30-day signups area chart. Recharts is a client-only library
 * (it reads DOM size via ResponsiveContainer), so this is the smallest
 * possible "use client" surface — the parent RSC owns the query and the
 * card chrome.
 *
 * We intentionally skip a y-axis grid: the widget is meant for shape
 * recognition (growing? flat? spiking?), not exact reads. Hover-tooltip
 * is the precise-value channel.
 */
export interface SignupsTrendChartProps {
  data: ReadonlyArray<{ day: string; value: number }>;
}

export default function SignupsTrendChart({ data }: SignupsTrendChartProps) {
  const locale = useLocale();

  // Tick formatter: only render a label on day-of-month boundaries we
  // can guarantee fit (every ~5th day). Recharts handles overlap a bit,
  // but on small widths it's safer to thin them ourselves.
  function formatXTick(value: string, index: number): string {
    if (index % 5 !== 0) return "";
    return formatShortDate(value, locale);
  }

  // ResponsiveContainer with 100%×100% measures the parent via
  // getBoundingClientRect on first paint. Inside a flex-column chain
  // (WidgetCard body → wrapper) the browser can still be mid-layout
  // and the container reads back -1×-1, then never recovers. The
  // absolute-inside-relative trick gives ResponsiveContainer a parent
  // with explicit pixel dimensions (inset:0 = the outer relative box,
  // already sized by the flex chain) so the first measurement is
  // always non-zero.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={[...data]}
            margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
          >
            <defs>
              <linearGradient id="signupsTrendFill" x1="0" y1="0" x2="0" y2="1">
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
              formatter={(v) => [String(v), ""] as [string, string]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--admin-accent)"
              strokeWidth={2}
              fill="url(#signupsTrendFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
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
