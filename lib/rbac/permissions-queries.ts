/**
 * Query DB per la gestione RBAC nel pannello admin.
 */
import { db } from "@/lib/db/drizzle";
import { getAllSystemPermissions } from "@/lib/db/permissions-data";
import {
  permissions,
  rolePermissions,
  userPermissions,
  roles,
  users,
  userProfiles,
} from "@/lib/db/schema";
import { and, eq, gt, isNull, lt, or, desc, sql } from "drizzle-orm";

const USERS_WITH_PERMISSION_LIMIT = 200;

export async function getAllPermissions() {
  return db
    .select()
    .from(permissions)
    .orderBy(permissions.group, permissions.key);
}

export async function getPermissionsByRole(roleId: number) {
  return db
    .select({ id: permissions.id, key: permissions.key, label: permissions.label, group: permissions.group })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId))
    .orderBy(permissions.group, permissions.key);
}

export async function getUserPermissionOverrides(userId: string) {
  return db
    .select({
      id: userPermissions.id,
      permissionKey: permissions.key,
      permissionLabel: permissions.label,
      permissionGroup: permissions.group,
      granted: userPermissions.granted,
      reason: userPermissions.reason,
      expiresAt: userPermissions.expiresAt,
      createdAt: userPermissions.createdAt,
      updatedAt: userPermissions.updatedAt,
      grantedById: userPermissions.grantedBy,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.userId, userId))
    .orderBy(desc(userPermissions.updatedAt));
}

export async function purgeExpiredOverrides(userId: string): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        lt(userPermissions.expiresAt, now),
      ),
    )
    .returning({ id: userPermissions.id });
  return result.length;
}

export async function getUsersWithPermission(permissionKey: string) {
  const now = new Date();

  const viaRole = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      role: users.role,
      source: sql<string>`'role'`,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(roles, eq(users.role, roles.name))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(permissions.key, permissionKey))
    .limit(USERS_WITH_PERMISSION_LIMIT);

  const viaOverride = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      role: users.role,
      source: sql<string>`'override'`,
    })
    .from(userPermissions)
    .innerJoin(users, eq(userPermissions.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(
      and(
        eq(permissions.key, permissionKey),
        eq(userPermissions.granted, true),
        or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, now)),
      ),
    )
    .limit(USERS_WITH_PERMISSION_LIMIT);

  const map = new Map<string, (typeof viaRole)[0]>();
  for (const u of viaRole) map.set(u.id, u);
  for (const u of viaOverride) map.set(u.id, u);

  const all = Array.from(map.values());
  const truncated = all.length >= USERS_WITH_PERMISSION_LIMIT;

  return { users: all, truncated, limit: USERS_WITH_PERMISSION_LIMIT };
}

/**
 * Counts users who would actually lose access if this permission were
 * deleted, replicating the exact policy of can() in lib/rbac/can.ts:
 *
 *   - super-admins (users.is_admin = true) bypass RBAC entirely, so they
 *     don't lose anything → excluded.
 *   - soft-deleted users → excluded (deleted_at IS NOT NULL).
 *   - for each remaining user, the most recent non-expired override on
 *     (user, permission) wins:
 *       · latest override granted=true → user HAS the permission.
 *       · latest override granted=false → user does NOT have it.
 *       · no active override → role decides.
 *
 * Implemented as a single SQL with a `DISTINCT ON` CTE so we hit the DB
 * once instead of fanning out to one query per branch. Result is a
 * precise integer with no row limit — meant for the "X users will lose
 * access" line in the delete-confirmation dialog.
 */
export async function countEffectiveUsersForPermission(
  permissionId: number,
): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`
    WITH latest_overrides AS (
      SELECT DISTINCT ON (user_id) user_id, granted
      FROM user_permissions
      WHERE permission_id = ${permissionId}
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY user_id, created_at DESC
    ),
    role_holders AS (
      SELECT r.name AS role_name
      FROM roles r
      INNER JOIN role_permissions rp ON rp.role_id = r.id
      WHERE rp.permission_id = ${permissionId}
    )
    SELECT COUNT(DISTINCT u.id)::int AS count
    FROM users u
    LEFT JOIN latest_overrides lo ON lo.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.is_admin = false
      AND (
        lo.granted = true
        OR (
          lo.granted IS NULL
          AND u.role IN (SELECT role_name FROM role_holders)
        )
      )
  `);

  const rows = Array.from(
    result as unknown as Array<{ count: number }>,
  );
  return rows[0]?.count ?? 0;
}

export async function addPermissionToRole(roleId: number, permissionId: number) {
  return db
    .insert(rolePermissions)
    .values({ roleId, permissionId })
    .onConflictDoNothing();
}

export async function removePermissionFromRole(roleId: number, permissionId: number) {
  return db
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.permissionId, permissionId),
      ),
    );
}

export async function addUserPermissionOverride(data: {
  userId: string;
  permissionId: number;
  granted: boolean;
  grantedBy: string;
  reason?: string;
  expiresAt?: Date | null;
}) {
  return db
    .insert(userPermissions)
    .values({ ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userPermissions.userId, userPermissions.permissionId],
      set: {
        granted: data.granted,
        grantedBy: data.grantedBy,
        reason: data.reason ?? null,
        expiresAt: data.expiresAt ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function removeUserPermissionOverride(overrideId: number) {
  return db.delete(userPermissions).where(eq(userPermissions.id, overrideId));
}

// ---------------------------------------------------------------------------
// System permissions drift detection
// ---------------------------------------------------------------------------

export type SystemPermissionsDrift = {
  /** Keys defined in code but not present in the DB. */
  missing: Array<{ key: string; label: string; group: string }>;
  /** Keys whose label or group in the DB differs from the code. */
  divergent: Array<{
    key: string;
    dbLabel: string;
    dbGroup: string;
    codeLabel: string;
    codeGroup: string;
  }>;
};

/**
 * Compares the in-code system permission catalog against the DB and
 * reports the drift. Used by /admin/access/permissions to surface a
 * banner + Sync button when the DB is behind the codebase.
 */
export async function getSystemPermissionsDrift(): Promise<SystemPermissionsDrift> {
  const codePerms = getAllSystemPermissions();
  const dbPerms = await db
    .select({
      key: permissions.key,
      label: permissions.label,
      group: permissions.group,
    })
    .from(permissions);

  const dbByKey = new Map(dbPerms.map((p) => [p.key, p]));

  const missing: SystemPermissionsDrift["missing"] = [];
  const divergent: SystemPermissionsDrift["divergent"] = [];

  for (const cp of codePerms) {
    const existing = dbByKey.get(cp.key);
    if (!existing) {
      missing.push({ key: cp.key, label: cp.label, group: cp.group });
      continue;
    }
    if (existing.label !== cp.label || existing.group !== cp.group) {
      divergent.push({
        key: cp.key,
        dbLabel: existing.label,
        dbGroup: existing.group,
        codeLabel: cp.label,
        codeGroup: cp.group,
      });
    }
  }

  return { missing, divergent };
}
