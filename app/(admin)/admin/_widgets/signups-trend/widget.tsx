import { getTranslations } from "next-intl/server";
import { and, gte, isNull, sql } from "drizzle-orm";
import { TrendingUp } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import SignupsTrendChart from "./chart";

const DAYS = 30;

export default async function SignupsTrendWidget() {
  const since = startOfDayUtc(new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000));

  const [rows, t] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${users.createdAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
        value: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(and(gte(users.createdAt, since), isNull(users.deletedAt)))
      .groupBy(sql`date_trunc('day', ${users.createdAt}) at time zone 'UTC'`)
      .orderBy(sql`date_trunc('day', ${users.createdAt}) at time zone 'UTC'`),
    getTranslations("admin.dashboard.widgets.signupsTrend"),
  ]);

  // Backfill days that had zero signups so the chart's x-axis is dense
  // and the area doesn't jump weirdly across gaps. Server-side because
  // the client component only does presentation.
  const series = backfillDays(rows, DAYS);
  const total = series.reduce((acc, p) => acc + p.value, 0);

  return (
    <WidgetCard title={t("title")} icon={TrendingUp} scrollable={false}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "var(--admin-text)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {total.toLocaleString()}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--admin-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {t("totalLabel", { days: DAYS })}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SignupsTrendChart data={series} />
      </div>
    </WidgetCard>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function backfillDays(
  rows: ReadonlyArray<{ day: string; value: number }>,
  days: number,
): Array<{ day: string; value: number }> {
  const map = new Map(rows.map((r) => [r.day, r.value]));
  const out: Array<{ day: string; value: number }> = [];
  const today = startOfDayUtc(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    out.push({ day: key, value: map.get(key) ?? 0 });
  }
  return out;
}
