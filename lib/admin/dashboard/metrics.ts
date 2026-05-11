// lib/admin/dashboard/metrics.ts
//
// Operational metrics for the admin dashboard widget — four COUNT
// queries over indexed columns, returned as a single snapshot and
// wrapped in `unstable_cache` (60s TTL) so the dashboard never pays the
// fan-out twice in a row.
//
// We deliberately stick to aggregates (COUNT) instead of fetching rows
// to keep the surface tiny. If a metric ever needs context drill-down
// (e.g. "who registered in the last 24h?") the right place to add it is
// a dedicated page, not this widget.

import "server-only";

import { unstable_cache } from "next/cache";
import { and, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  adminNotifications,
  loginAttempts,
  sessions,
  users,
} from "@/lib/db/schema";

export interface OperationalMetrics {
  /** Users with `created_at` in the last 24h. */
  signups24h: number;
  /** Sessions that are not revoked and haven't expired. */
  activeSessions: number;
  /** `login_attempts` rows with `success = false` in the last 24h. */
  failedLogins24h: number;
  /** `admin_notifications` that are not dismissed/resolved/snoozed. */
  pendingAlerts: number;
  /** Unix ms — when the snapshot was computed (cache key, not now). */
  fetchedAt: number;
}

export const METRICS_TAG = "admin-dashboard-metrics";

async function safeCount(query: Promise<{ value: number }[]>): Promise<number> {
  try {
    const rows = await query;
    return rows[0]?.value ?? 0;
  } catch {
    // A single broken metric must not kill the whole widget. Default to
    // 0 — the widget renders the value as 0 instead of an error card.
    return 0;
  }
}

async function fetchMetricsUncached(): Promise<OperationalMetrics> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  const [signups24h, activeSessions, failedLogins24h, pendingAlerts] =
    await Promise.all([
      safeCount(
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(users)
          .where(and(gte(users.createdAt, since24h), isNull(users.deletedAt))),
      ),
      safeCount(
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(sessions)
          .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, now))),
      ),
      safeCount(
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(loginAttempts)
          .where(
            and(
              eq(loginAttempts.success, false),
              gte(loginAttempts.attemptedAt, since24h),
            ),
          ),
      ),
      safeCount(
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(adminNotifications)
          .where(
            and(
              isNull(adminNotifications.dismissedAt),
              isNull(adminNotifications.resolvedAt),
              or(
                isNull(adminNotifications.snoozedUntil),
                lt(adminNotifications.snoozedUntil, now),
              ),
            ),
          ),
      ),
    ]);

  return {
    signups24h,
    activeSessions,
    failedLogins24h,
    pendingAlerts,
    fetchedAt: Date.now(),
  };
}

export const getOperationalMetrics = unstable_cache(
  fetchMetricsUncached,
  ["admin-dashboard-metrics-v1"],
  { tags: [METRICS_TAG], revalidate: 60 },
);
