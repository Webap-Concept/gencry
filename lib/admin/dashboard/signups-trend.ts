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
  // ISO string, not Date — postgres-js rejects Date as a bound param in
  // raw SQL templates ("ERR_INVALID_ARG_TYPE: Received an instance of
  // Date"). The driver only auto-serializes Date when drizzle's query
  // builder owns the column (typed `timestamp`); a raw template tag
  // bypasses that path, so we pass an ISO string and let Postgres cast
  // it to timestamptz at the comparison.
  const since = startOfDayUtc(
    new Date(Date.now() - days * 86_400_000),
  ).toISOString();

  // A single UNION ALL feeds two FILTER aggregates — Postgres scans the
  // users table at most twice (once per WHERE clause) and merges the
  // results in memory. Bound parameter is passed via tagged template so
  // drizzle parameterizes it instead of inlining.
  const result = await db.execute<{
    day: string;
    signups: number;
    unsubs: number;
  }>(sql`
    SELECT
      to_char(d AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE k = 'signup')::int AS signups,
      COUNT(*) FILTER (WHERE k = 'unsub')::int  AS unsubs
    FROM (
      SELECT date_trunc('day', created_at) AS d, 'signup'::text AS k
      FROM users WHERE created_at >= ${since}::timestamptz
      UNION ALL
      SELECT date_trunc('day', deleted_at) AS d, 'unsub'::text AS k
      FROM users WHERE deleted_at >= ${since}::timestamptz
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
