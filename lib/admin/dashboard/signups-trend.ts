// lib/admin/dashboard/signups-trend.ts
//
// Backing query for the Signups Trend widget. Two design choices worth
// flagging:
//
//   1. ONE query, not two. Two parallel SELECT queries (signups +
//      unsubs) would mean two roundtrips and two table scans. A single
//      UNION ALL + COUNT FILTER does both in a single statement; the
//      query planner uses a partial-index-friendly WHERE on each leg
//      and aggregates the union in memory.
//
//   2. Cached 5 minutes via unstable_cache. The dashboard widget runs
//      on every page load — without caching the same admin opening
//      the dashboard 10 times in 5 minutes would hit the DB 10 times.
//      The tag lets us invalidate on demand (e.g. after a manual
//      cleanup script) without waiting for the TTL.

import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";

export const SIGNUPS_TREND_TAG = "admin-dashboard-signups-trend";

export interface DayPoint {
  /** ISO date in UTC (YYYY-MM-DD). */
  day: string;
  signups: number;
  unsubs: number;
}

export interface SignupsTrendSummary {
  /** Backfilled to `days` length so the chart x-axis is dense. */
  series: DayPoint[];
  /** Sum of `signups` across the window. */
  totalSignups: number;
  /** Sum of `unsubs` across the window. */
  totalUnsubs: number;
  /** signups − unsubs across the window. Signed; can be negative. */
  net: number;
}

async function fetchSignupsTrendUncached(
  days: number,
): Promise<SignupsTrendSummary> {
  // Lower bound computed server-side as `now() - make_interval(days)`
  // instead of binding a Date / ISO string. Two reasons:
  //   1. Removes any chance of the postgres-js driver choking on the
  //      bound value type (the previous Date and even ISO string casts
  //      both surfaced edge cases on Vercel cold starts);
  //   2. Clock authority lives on the DB, so concurrent renders within
  //      the same second see exactly the same window. The only bound
  //      parameter is `days` (a plain number), trivially safe.
  // `now()` here is `transaction_timestamp()` semantics — fine for a
  // 30-day window where sub-second drift is meaningless.

  // A single UNION ALL feeds two FILTER aggregates — Postgres scans the
  // users table at most twice (once per WHERE clause) and merges the
  // results in memory.
  const result = await db.execute<{
    day: string;
    signups: number;
    unsubs: number;
  }>(sql`
    WITH window_start AS (
      SELECT date_trunc('day', now() - make_interval(days => ${days})) AS d
    )
    SELECT
      to_char(d AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE k = 'signup')::int AS signups,
      COUNT(*) FILTER (WHERE k = 'unsub')::int  AS unsubs
    FROM (
      SELECT date_trunc('day', created_at) AS d, 'signup'::text AS k
      FROM users
      WHERE created_at >= (SELECT d FROM window_start)
      UNION ALL
      SELECT date_trunc('day', deleted_at) AS d, 'unsub'::text AS k
      FROM users
      WHERE deleted_at >= (SELECT d FROM window_start)
    ) events
    GROUP BY d
    ORDER BY d
  `);

  // postgres-js returns a RowList that's iterable-as-array but isn't
  // typed as one. Match the cast pattern used elsewhere in lib/.
  const rows = Array.from(
    result as unknown as Array<{ day: string; signups: number; unsubs: number }>,
  );

  const series = backfillDays(rows, days);
  const totalSignups = series.reduce((acc, p) => acc + p.signups, 0);
  const totalUnsubs = series.reduce((acc, p) => acc + p.unsubs, 0);

  return {
    series,
    totalSignups,
    totalUnsubs,
    net: totalSignups - totalUnsubs,
  };
}

export const getSignupsTrend = unstable_cache(
  fetchSignupsTrendUncached,
  ["admin-dashboard-signups-trend-v1"],
  { tags: [SIGNUPS_TREND_TAG], revalidate: 300 },
);

// ── Helpers ────────────────────────────────────────────────────────────────

function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

/**
 * Fill in zero rows for days that had no events in the window so the
 * chart x-axis is dense (no implicit lines jumping across gaps).
 */
function backfillDays(
  rows: ReadonlyArray<{ day: string; signups: number; unsubs: number }>,
  days: number,
): DayPoint[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  const today = startOfDayUtc(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = formatUtcDateKey(d);
    const row = map.get(key);
    out.push({
      day: key,
      signups: row?.signups ?? 0,
      unsubs: row?.unsubs ?? 0,
    });
  }
  return out;
}

function formatUtcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
