"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  permissions,
  rolePermissions,
  roles,
  userPermissions,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import {
  addPermissionToRole,
  removePermissionFromRole,
} from "@/lib/rbac/permissions-queries";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

/** Writes a record to activity_logs with the requester's IP. */
async function logRbacAction(
  adminId: string,
  action: ActivityType,
  detail: string,
) {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ??
    (await headers()).get("x-real-ip") ??
    null;

  await db.insert(activityLogs).values({
    userId: adminId,
    action: `${action} | ${detail}`,
    ipAddress: ip,
  });
}

/** Toggles a permission on a role (add / remove) */
export async function toggleRolePermission(
  roleId: number,
  permissionId: number,
  granted: boolean,
) {
  const admin = await requireAdmin();

  // Retrieve role and permission labels for readable logging
  const [role] = await db
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  const [perm] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  if (granted) {
    await addPermissionToRole(roleId, permissionId);
  } else {
    await removePermissionFromRole(roleId, permissionId);
  }

  await logRbacAction(
    admin.id,
    granted
      ? ActivityType.ROLE_PERMISSION_ADDED
      : ActivityType.ROLE_PERMISSION_REMOVED,
    `role=${role?.name ?? roleId} perm=${perm?.key ?? permissionId}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  revalidatePath(getAdminPath("users-roles"));
}

/**
 * Grants a permission to a role (used by RoleMatrix with optimistic UI).
 */
export async function grantPermissionToRole(
  roleId: number,
  permissionId: number,
) {
  const admin = await requireAdmin();

  const [role] = await db
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  const [perm] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  await addPermissionToRole(roleId, permissionId);

  await logRbacAction(
    admin.id,
    ActivityType.ROLE_PERMISSION_ADDED,
    `role=${role?.name ?? roleId} perm=${perm?.key ?? permissionId}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  revalidatePath(getAdminPath("users-roles"));
}

/**
 * Revokes a permission from a role (used by RoleMatrix with optimistic UI).
 */
export async function revokePermissionFromRole(
  roleId: number,
  permissionId: number,
) {
  const admin = await requireAdmin();

  const [role] = await db
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  const [perm] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  await removePermissionFromRole(roleId, permissionId);

  await logRbacAction(
    admin.id,
    ActivityType.ROLE_PERMISSION_REMOVED,
    `role=${role?.name ?? roleId} perm=${perm?.key ?? permissionId}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  revalidatePath(getAdminPath("users-roles"));
}

/** Creates a new permission in the catalog */
const CreatePermissionSchema = z.object({
  key: z
    .string()
    .min(3)
    .regex(/^[a-z0-9_]+:[a-z0-9_]+$/, {
      message: 'Required format: resource:action (e.g. "posts:publish")',
    }),
  label: z.string().min(2).max(150),
  description: z.string().max(500).optional(),
  group: z.string().min(1).max(100),
});

export async function createPermission(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = CreatePermissionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { key, label, description, group } = parsed.data;

  const existing = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, key))
    .limit(1);

  if (existing.length > 0) {
    return { error: `Permission "${key}" already exists.` };
  }

  const [insertedPerm] = await db
    .insert(permissions)
    .values({ key, label, description, group })
    .returning({ id: permissions.id });

  // Auto-assign to admin role
  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "admin"))
    .limit(1);

  if (adminRole && insertedPerm) {
    await addPermissionToRole(adminRole.id, insertedPerm.id);
  }

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_GRANTED,
    `create_permission key=${key} group=${group}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  return { success: true };
}

/** Update schema — key is NOT editable */
const UpdatePermissionSchema = z.object({
  label: z.string().min(2).max(150),
  description: z.string().max(500).optional(),
  group: z.string().min(1).max(100),
});

/**
 * Updates label, description, and group of an existing permission.
 * The `key` is intentionally excluded: modifying it would break
 * all hardcoded hasPermission() checks in the codebase.
 * System permissions can still be updated (UI fields only).
 */
export async function updatePermission(
  permissionId: number,
  formData: FormData,
) {
  const admin = await requireAdmin();

  const parsed = UpdatePermissionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const [existing] = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  if (!existing) {
    return { error: "Permission not found." };
  }

  const { label, description, group } = parsed.data;

  await db
    .update(permissions)
    .set({ label, description: description ?? null, group })
    .where(eq(permissions.id, permissionId));

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_GRANTED,
    `update_permission key=${existing.key} label=${label} group=${group}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  return { success: true };
}

/**
 * Returns the number of assignments linked to a permission
 * (roles + individual overrides). Used by the confirmation dialog.
 */
export async function getPermissionImpact(permissionId: number) {
  await requireAdmin();

  const perm = await db
    .select({
      isSystem: permissions.isSystem,
      key: permissions.key,
      label: permissions.label,
    })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  if (!perm[0]) return { error: "Permission not found." };
  if (perm[0].isSystem)
    return { error: "System permissions cannot be deleted." };

  const roleCount = await db
    .select({ id: rolePermissions.roleId })
    .from(rolePermissions)
    .where(eq(rolePermissions.permissionId, permissionId));

  const userCount = await db
    .select({ id: userPermissions.id })
    .from(userPermissions)
    .where(eq(userPermissions.permissionId, permissionId));

  return {
    key: perm[0].key,
    label: perm[0].label,
    roleAssignments: roleCount.length,
    userOverrides: userCount.length,
  };
}

/**
 * Deletes a permission with cascade:
 * removes all assignments on roles and individual overrides first.
 */
export async function deletePermission(permissionId: number) {
  const admin = await requireAdmin();

  const [perm] = await db
    .select({ isSystem: permissions.isSystem, key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  if (!perm || perm.isSystem) {
    return { error: "System permissions cannot be deleted." };
  }

  // Cascade: remove role assignments
  await db
    .delete(rolePermissions)
    .where(eq(rolePermissions.permissionId, permissionId));
  // Cascade: remove individual overrides
  await db
    .delete(userPermissions)
    .where(eq(userPermissions.permissionId, permissionId));
  // Delete the permission itself
  await db.delete(permissions).where(eq(permissions.id, permissionId));

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_REVOKED,
    `delete_permission key=${perm.key}`,
  );

  revalidatePath(getAdminPath("users-permissions"));
  revalidatePath(getAdminPath("users-roles"));
  return { success: true };
}

/**
 * Returns users who have a specific permission (via role or override).
 * Used by the "Who has this permission?" drawer in the catalog.
 */
export async function fetchUsersWithPermission(permissionKey: string) {
  await requireAdmin();
  const { getUsersWithPermission } =
    await import("@/lib/rbac/permissions-queries");
  return getUsersWithPermission(permissionKey);
}
