// lib/db/admin-sessions-queries.ts
//
// Read-side queries used by /admin/access/sessions and the Sessions tab
// inside the user-detail page. Write paths (revoke single / revoke all
// for a user) reuse the helpers in `lib/auth/sessions.ts` so cache
// invalidation stays consistent.
//
// "Active" here means: not revoked AND not past hard expiry. We do NOT
// filter by idle-timeout in the listing — surfacing idled-but-not-yet-
// expired sessions is useful for an admin auditing ghost devices.

import { db } from "@/lib/db/drizzle";
import { isUndefinedTableError } from "@/lib/db/errors";
import { sessionAlerts, sessions, userProfiles, users } from "@/lib/db/schema";
import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import "server-only";

export type AdminSessionStatus = "active" | "revoked" | "expired" | "all";

export type AdminSessionRow = {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Derived: status at query time. */
  status: "active" | "revoked" | "expired";
};

const VALID_STATUSES: AdminSessionStatus[] = [
  "active",
  "revoked",
  "expired",
  "all",
];

export function parseAdminSessionStatus(raw: string | undefined): AdminSessionStatus {
  return VALID_STATUSES.includes(raw as AdminSessionStatus)
    ? (raw as AdminSessionStatus)
    : "active";
}

// ---------------------------------------------------------------------------
// Listing with filters + pagination
// ---------------------------------------------------------------------------

export type ListAdminSessionsParams = {
  search?: string;
  ip?: string;
  status?: AdminSessionStatus;
  userId?: string;
  page?: number;
  perPage?: number;
};

export async function listAdminSessions({
  search = "",
  ip = "",
  status = "active",
  userId,
  page = 1,
  perPage = 25,
}: ListAdminSessionsParams = {}) {
  noStore();

  const offset = (page - 1) * perPage;

  // Status filter: derive from revoked_at + expires_at. We branch on the
  // enum so the planner can use the dedicated indexes.
  const statusFilter = (() => {
    switch (status) {
      case "active":
        return and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()));
      case "revoked":
        return isNotNull(sessions.revokedAt);
      case "expired":
        return and(isNull(sessions.revokedAt), lte(sessions.expiresAt, new Date()));
      case "all":
      default:
        return undefined;
    }
  })();

  const searchFilter = search
    ? or(
        ilike(users.email, `%${search}%`),
        ilike(userProfiles.firstName, `%${search}%`),
        ilike(userProfiles.lastName, `%${search}%`),
        ilike(userProfiles.username, `%${search}%`),
      )
    : undefined;

  const ipFilter = ip ? ilike(sessions.ip, `%${ip}%`) : undefined;
  const userFilter = userId ? eq(sessions.userId, userId) : undefined;

  const whereClause = and(
    ...[statusFilter, searchFilter, ipFilter, userFilter].filter(
      (c): c is NonNullable<typeof c> => c !== undefined,
    ),
  );

  const baseQuery = db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      email: users.email,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      username: userProfiles.username,
      avatarUrl: userProfiles.avatarUrl,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(whereClause)
    .orderBy(desc(sessions.lastSeenAt))
    .limit(perPage)
    .offset(offset);

  const countQuery = db
    .select({ count: count() })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(whereClause);

  const [rows, totalRows] = await Promise.all([baseQuery, countQuery]);
  const total = totalRows[0]?.count ?? 0;

  const now = Date.now();
  const items: AdminSessionRow[] = rows.map((r) => ({
    ...r,
    status: r.revokedAt
      ? "revoked"
      : r.expiresAt.getTime() <= now
        ? "expired"
        : "active",
  }));

  return { items, total };
}

// ---------------------------------------------------------------------------
// Per-user listing (Sessions tab inside /admin/access/users/[id])
// ---------------------------------------------------------------------------

export async function listAdminUserSessions(userId: string) {
  noStore();

  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(100);

  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    status: (r.revokedAt
      ? "revoked"
      : r.expiresAt.getTime() <= now
        ? "expired"
        : "active") as "active" | "revoked" | "expired",
  }));
}

// ---------------------------------------------------------------------------
// KPIs for the dashboard header
// ---------------------------------------------------------------------------

export type AdminSessionsKpis = {
  /** Sessions currently active (not revoked, not expired). */
  activeNow: number;
  /** Distinct users with at least one active session. */
  uniqueUsersOnline: number;
  /** Sessions revoked in the last 24h. */
  revokedLast24h: number;
  /** Sessions opened in the last 24h. */
  createdLast24h: number;
};

// ---------------------------------------------------------------------------
// Suspicious-session alerts
// ---------------------------------------------------------------------------

export type AlertStatusFilter = "open" | "acknowledged" | "all";
export type AlertSeverityFilter = "all" | "info" | "warning" | "critical";

export type AdminAlertRow = {
  id: number;
  reason: string;
  severity: string;
  details: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  emailSentAt: Date | null;
  sessionId: string | null;
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export async function listAdminAlerts(params: {
  status?: AlertStatusFilter;
  severity?: AlertSeverityFilter;
  page?: number;
  perPage?: number;
} = {}) {
  noStore();
  const { status = "open", severity = "all", page = 1, perPage = 25 } = params;
  const offset = (page - 1) * perPage;

  const statusFilter =
    status === "open"
      ? isNull(sessionAlerts.acknowledgedAt)
      : status === "acknowledged"
        ? isNotNull(sessionAlerts.acknowledgedAt)
        : undefined;

  const severityFilter =
    severity === "all" ? undefined : eq(sessionAlerts.severity, severity);

  const whereClause = and(
    ...[statusFilter, severityFilter].filter(
      (c): c is NonNullable<typeof c> => c !== undefined,
    ),
  );

  // If the table doesn't exist yet (migration not applied) return an
  // empty page so the Alerts tab keeps rendering instead of throwing.
  let rows: AdminAlertRow[] = [];
  let total = 0;
  try {
    const [rawRows, totalRows] = await Promise.all([
      db
        .select({
          id: sessionAlerts.id,
          reason: sessionAlerts.reason,
          severity: sessionAlerts.severity,
          details: sessionAlerts.details,
          createdAt: sessionAlerts.createdAt,
          acknowledgedAt: sessionAlerts.acknowledgedAt,
          acknowledgedBy: sessionAlerts.acknowledgedBy,
          emailSentAt: sessionAlerts.emailSentAt,
          sessionId: sessionAlerts.sessionId,
          userId: sessionAlerts.userId,
          email: users.email,
          firstName: userProfiles.firstName,
          lastName: userProfiles.lastName,
          username: userProfiles.username,
          avatarUrl: userProfiles.avatarUrl,
        })
        .from(sessionAlerts)
        .leftJoin(users, eq(users.id, sessionAlerts.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, sessionAlerts.userId))
        .where(whereClause)
        .orderBy(desc(sessionAlerts.createdAt))
        .limit(perPage)
        .offset(offset),
      db.select({ count: count() }).from(sessionAlerts).where(whereClause),
    ]);
    rows = rawRows.map((r) => ({
      ...r,
      details: (r.details ?? {}) as Record<string, unknown>,
    }));
    total = totalRows[0]?.count ?? 0;
  } catch (err) {
    if (!isUndefinedTableError(err, "session_alerts")) throw err;
  }
  return { items: rows, total };
}

export async function getAdminSessionsKpis(): Promise<AdminSessionsKpis> {
  noStore();

  const now = new Date();

  const [activeRow, uniqueRow, revokedRow, createdRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(sessions)
      .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, now))),
    db
      .select({ count: sql<number>`COUNT(DISTINCT ${sessions.userId})::int` })
      .from(sessions)
      .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, now))),
    db
      .select({ count: count() })
      .from(sessions)
      .where(sql`${sessions.revokedAt} >= NOW() - INTERVAL '24 hours'`),
    db
      .select({ count: count() })
      .from(sessions)
      .where(sql`${sessions.createdAt} >= NOW() - INTERVAL '24 hours'`),
  ]);

  return {
    activeNow: activeRow[0]?.count ?? 0,
    uniqueUsersOnline: uniqueRow[0]?.count ?? 0,
    revokedLast24h: revokedRow[0]?.count ?? 0,
    createdLast24h: createdRow[0]?.count ?? 0,
  };
}
