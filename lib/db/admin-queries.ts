// lib/db/admin-queries.ts
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  pageTemplates,
  pages,
  permissions,
  redirects,
  rolePermissions,
  roles,
  userProfiles,
  userSubscriptions,
  users,
} from "@/lib/db/schema";
import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import "server-only";

// ---------------------------------------------------------------------------
// Subquery riutilizzabile
// ---------------------------------------------------------------------------
const hasAdminPermission = (userAlias: typeof users) =>
  sql<boolean>`(
    ${userAlias.isAdmin} = true
    OR EXISTS (
      SELECT 1
      FROM ${rolePermissions}
      INNER JOIN ${permissions} ON ${permissions.id} = ${rolePermissions.permissionId}
      INNER JOIN ${roles} ON ${roles.name} = ${userAlias.role}
      WHERE ${rolePermissions.roleId} = ${roles.id}
        AND ${permissions.key} LIKE 'admin:%'
    )
  )`;

const lacksAdminPermission = (userAlias: typeof users) =>
  sql<boolean>`(
    ${userAlias.isAdmin} = false
    AND NOT EXISTS (
      SELECT 1
      FROM ${rolePermissions}
      INNER JOIN ${permissions} ON ${permissions.id} = ${rolePermissions.permissionId}
      INNER JOIN ${roles} ON ${roles.name} = ${userAlias.role}
      WHERE ${rolePermissions.roleId} = ${roles.id}
        AND ${permissions.key} LIKE 'admin:%'
    )
  )`;

export async function getDashboardStats() {
  const [
    totalUsers,
    newUsersThisMonth,
    newUsersLastMonth,
    premiumUsers,
    verifiedUsers,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), lacksAdminPermission(users))),
    db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          lacksAdminPermission(users),
          sql`${users.createdAt} >= NOW() - INTERVAL '30 days'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          lacksAdminPermission(users),
          sql`${users.createdAt} >= NOW() - INTERVAL '60 days'`,
          sql`${users.createdAt} < NOW() - INTERVAL '30 days'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(users)
      .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .where(
        and(
          isNull(users.deletedAt),
          lacksAdminPermission(users),
          isNotNull(userSubscriptions.stripeSubscriptionId),
          sql`${userSubscriptions.subscriptionStatus} = 'active'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          lacksAdminPermission(users),
          sql`${users.emailVerified} = true`,
        ),
      ),
  ]);

  const total = totalUsers[0].count;
  const newThis = newUsersThisMonth[0].count;
  const newLast = newUsersLastMonth[0].count;
  const premium = premiumUsers[0].count;
  const verified = verifiedUsers[0].count;
  const free = total - premium;
  const trendPercent =
    newLast > 0
      ? Math.round(((newThis - newLast) / newLast) * 100)
      : newThis > 0
        ? 100
        : 0;

  return {
    totalUsers: total,
    newUsersThisMonth: newThis,
    trendPercent,
    premiumUsers: premium,
    freeUsers: free,
    verifiedUsers: verified,
    conversionRate: total > 0 ? Math.round((premium / total) * 100) : 0,
  };
}

export async function getFullDashboardStats() {
  const [
    userStats,
    pagesPublished,
    pagesDraft,
    templatesCount,
    rolesCount,
    staffCount,
    redirectsCount,
    recentActivity,
  ] = await Promise.all([
    getDashboardStats(),
    db
      .select({ count: count() })
      .from(pages)
      .where(eq(pages.status, "published")),
    db.select({ count: count() }).from(pages).where(eq(pages.status, "draft")),
    db.select({ count: count() }).from(pageTemplates),
    db.select({ count: count() }).from(roles).where(eq(roles.isSystem, false)),
    db
      .select({ count: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), hasAdminPermission(users))),
    db
      .select({ count: count() })
      .from(redirects)
      .where(eq(redirects.isActive, true)),
    db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        userEmail: users.email,
        timestamp: activityLogs.timestamp,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .orderBy(desc(activityLogs.timestamp))
      .limit(8),
  ]);

  return {
    ...userStats,
    pagesPublished: pagesPublished[0].count,
    pagesDraft: pagesDraft[0].count,
    templatesCount: templatesCount[0].count,
    rolesCount: rolesCount[0].count,
    staffCount: staffCount[0].count,
    redirectsCount: redirectsCount[0].count,
    recentActivity,
  };
}

export async function getUserGrowthChart() {
  const rows = await db.execute(sql`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month, COUNT(*) AS total
    FROM users
    WHERE deleted_at IS NULL
      AND is_admin = false
      AND NOT EXISTS (
        SELECT 1
        FROM role_permissions rp
        INNER JOIN permissions p ON p.id = rp.permission_id
        INNER JOIN roles r ON r.name = users.role
        WHERE rp.role_id = r.id AND p.key LIKE 'admin:%'
      )
      AND created_at >= NOW() - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at) ASC
  `);
  return (rows as any[]).map((r) => ({
    month: r.month as string,
    utenti: Number(r.total),
  }));
}

export type AdminUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string;
  role: string;
  roleLabel: string | null;
  roleColor: string | null;
  isAdmin: boolean;
  planName: string | null;
  subscriptionStatus: string | null;
  emailVerified: boolean;
  createdAt: Date;
  bannedAt: Date | null;
  deletedAt: Date | null;
  bannedReason: string | null;
  avatarUrl: string | null;
  /** Counter denormalizzato (0..3) degli strike attivi su questo
   *  utente. Aggiornato via trigger DB users_strikes_sync_count_trg.
   *  Al raggiungimento di 3, banned_at viene settato automaticamente. */
  activeStrikesCount: number;
};

export type AdminUsersStatus =
  | "active"
  | "deletion_requested"
  | "with_strikes"
  | "all";

export async function getAdminUsers({
  search = "",
  role = "",
  plan = "",
  verified = "",
  status = "active",
  page = 1,
  perPage = 20,
  filter,
}: {
  search?: string;
  role?: string;
  plan?: string;
  verified?: string;
  status?: AdminUsersStatus;
  page?: number;
  perPage?: number;
  filter?: "all" | "active" | "banned" | "premium" | "free";
} = {}) {
  noStore();

  const offset = (page - 1) * perPage;

  const normalizedFilter =
    filter && filter !== "all"
      ? filter
      : plan === "premium"
        ? "premium"
        : plan === "free"
          ? "free"
          : undefined;

  // Filtro su deleted_at:
  //   active             -> isNull (default, comportamento storico)
  //   deletion_requested -> isNotNull (mostra solo i soft-deleted in grace o oltre)
  //   with_strikes       -> isNull deleted_at + active_strikes_count > 0
  //                         (utenti attivi che hanno almeno 1 strike non
  //                         revocato; bannati al 3° strike compresi)
  //   all                -> nessun filtro
  const deletionFilter =
    status === "deletion_requested"
      ? isNotNull(users.deletedAt)
      : status === "all"
        ? undefined
        : isNull(users.deletedAt);

  // Filtro strike-only: applicato in AND con deletionFilter (entrambi
  // narrowing). Ortogonale agli altri filter (role/plan/verified).
  const strikesFilter =
    status === "with_strikes" ? sql`${users.activeStrikesCount} > 0` : undefined;

  const baseWhere = and(
    deletionFilter,
    strikesFilter,
    lacksAdminPermission(users),
    search
      ? sql`(
          ${users.email} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.firstName} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.lastName} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.username} ILIKE ${"%" + search + "%"}
        )`
      : undefined,
    role ? eq(users.role, role) : undefined,
    verified === "true"
      ? sql`${users.emailVerified} = true`
      : verified === "false"
        ? sql`${users.emailVerified} = false`
        : undefined,
    normalizedFilter === "banned"
      ? isNotNull(users.bannedAt)
      : normalizedFilter === "premium"
        ? and(
            isNotNull(userSubscriptions.stripeSubscriptionId),
            sql`${userSubscriptions.subscriptionStatus} = 'active'`,
          )
        : normalizedFilter === "free"
          ? sql`(${userSubscriptions.stripeSubscriptionId} IS NULL OR ${userSubscriptions.subscriptionStatus} != 'active')`
          : normalizedFilter === "active"
            ? isNull(users.bannedAt)
            : undefined,
  );

  const [rows, totalCount] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        username: userProfiles.username,
        email: users.email,
        role: users.role,
        roleLabel: roles.label,
        roleColor: roles.color,
        isAdmin: users.isAdmin,
        planName: userSubscriptions.planName,
        subscriptionStatus: userSubscriptions.subscriptionStatus,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        bannedAt: users.bannedAt,
        activeStrikesCount: users.activeStrikesCount,
        deletedAt: users.deletedAt,
        bannedReason: users.bannedReason,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .leftJoin(roles, eq(users.role, roles.name))
      .where(baseWhere)
      .orderBy(desc(users.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: count() })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .leftJoin(roles, eq(users.role, roles.name))
      .where(baseWhere),
  ]);

  return {
    users: rows as AdminUser[],
    total: totalCount[0].count,
    page,
    perPage,
    totalPages: Math.ceil(totalCount[0].count / perPage),
  };
}

export async function getStaffUsers({
  search = "",
  role = "",
  page = 1,
  perPage = 20,
}: {
  search?: string;
  role?: string;
  page?: number;
  perPage?: number;
} = {}) {
  noStore();

  const offset = (page - 1) * perPage;

  const baseWhere = and(
    isNull(users.deletedAt),
    hasAdminPermission(users),
    search
      ? sql`(
          ${users.email} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.firstName} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.lastName} ILIKE ${"%" + search + "%"} OR
          ${userProfiles.username} ILIKE ${"%" + search + "%"}
        )`
      : undefined,
    role ? eq(users.role, role) : undefined,
  );

  const [rows, totalCount] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        username: userProfiles.username,
        email: users.email,
        role: users.role,
        roleLabel: roles.label,
        roleColor: roles.color,
        isAdmin: users.isAdmin,
        planName: userSubscriptions.planName,
        subscriptionStatus: userSubscriptions.subscriptionStatus,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        bannedAt: users.bannedAt,
        activeStrikesCount: users.activeStrikesCount,
        deletedAt: users.deletedAt,
        bannedReason: users.bannedReason,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .leftJoin(roles, eq(users.role, roles.name))
      .where(baseWhere)
      .orderBy(desc(users.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: count() })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
      .leftJoin(roles, eq(users.role, roles.name))
      .where(baseWhere),
  ]);

  return {
    users: rows as AdminUser[],
    total: totalCount[0].count,
    page,
    perPage,
    totalPages: Math.ceil(totalCount[0].count / perPage),
  };
}

export async function getAdminUserById(id: string) {
  const rows = await db
    .select({
      id: users.id,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      username: userProfiles.username,
      email: users.email,
      role: users.role,
      isAdmin: users.isAdmin,
      planName: userSubscriptions.planName,
      subscriptionStatus: userSubscriptions.subscriptionStatus,
      stripeCustomerId: userSubscriptions.stripeCustomerId,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      bannedAt: users.bannedAt,
      deletedAt: users.deletedAt,
      bannedReason: users.bannedReason,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export type AdminUserDetail = NonNullable<
  Awaited<ReturnType<typeof getAdminUserById>>
>;

export type AdminUserActivity = {
  id: number;
  action: string;
  ipAddress: string | null;
  timestamp: Date;
};

export async function getAdminUserActivity(
  userId: string,
): Promise<AdminUserActivity[]> {
  return db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      ipAddress: activityLogs.ipAddress,
      timestamp: activityLogs.timestamp,
    })
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.timestamp))
    .limit(30);
}

export async function getActivityLogs({
  page = 1,
  perPage = 20,
  tab = "rbac",
}: {
  page?: number;
  perPage?: number;
  tab?: string;
} = {}) {
  noStore();

  const offset = (page - 1) * perPage;

  const RBAC_ACTIONS = [
    "PERMISSION_GRANTED",
    "PERMISSION_REVOKED",
    "ROLE_PERMISSION_ADDED",
    "ROLE_PERMISSION_REMOVED",
    "ADMIN_CHANGE_ROLE",
    "ADMIN_BAN_USER",
    "ADMIN_UNBAN_USER",
    "ADMIN_DELETE_USER",
  ];
  const AUTH_ACTIONS = [
    "SIGN_IN",
    "SIGN_UP",
    "SIGN_OUT",
    "UPDATE_PASSWORD",
    "PASSWORD_RESET_REQUESTED",
    "PASSWORD_RESET_COMPLETED",
    "EMAIL_VERIFIED",
  ];
  const CONTENT_ACTIONS = [
    "PAGE_CREATED",
    "PAGE_UPDATED",
    "PAGE_DELETED",
    "PAGE_PUBLISHED",
    "PAGE_UNPUBLISHED",
    "TEMPLATE_CREATED",
    "TEMPLATE_UPDATED",
    "TEMPLATE_DELETED",
  ];

  const actionList =
    tab === "rbac"
      ? RBAC_ACTIONS
      : tab === "auth"
        ? AUTH_ACTIONS
        : tab === "pages"
          ? CONTENT_ACTIONS
          : null;

  const whereClause = actionList
    ? sql`split_part(${activityLogs.action}, ' | ', 1) = ANY(ARRAY[${sql.raw(
        actionList.map((a) => `'${a}'`).join(","),
      )}])`
    : undefined;

  const [rows, totalCount] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        userEmail: users.email,
        action: activityLogs.action,
        ipAddress: activityLogs.ipAddress,
        timestamp: activityLogs.timestamp,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(activityLogs.timestamp))
      .limit(perPage)
      .offset(offset),
    db.select({ count: count() }).from(activityLogs).where(whereClause),
  ]);

  return {
    logs: rows,
    total: totalCount[0].count,
    page,
    perPage,
    totalPages: Math.ceil(totalCount[0].count / perPage),
  };
}
