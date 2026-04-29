"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { activityLogs, ActivityType, roles, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import { and, eq, ne } from "drizzle-orm";
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

const roleSchema = z.object({
  name: z
    .string()
    .min(2, "Minimum 2 characters")
    .max(50)
    .regex(/^[a-z0-9_-]+$/, "Only lowercase letters, numbers, - and _"),
  label: z.string().min(2, "Minimum 2 characters").max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid HEX color"),
  description: z.string().max(300).optional(),
  /**
   * isAdmin = true only for the system "admin" role.
   * For all other access, use RBAC permissions (e.g., admin:access).
   * Emergency flag: bypasses the RBAC system.
   */
  isAdmin: z.boolean().default(false),
});

export async function createRole(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    label: formData.get("label"),
    color: formData.get("color"),
    description: formData.get("description") || undefined,
    isAdmin: formData.get("isAdmin") === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const allRoles = await getAdminRoles();
  const maxOrder = allRoles.reduce((m, r) => Math.max(m, r.sortOrder), 0);

  await db.insert(roles).values({
    ...parsed.data,
    isSystem: false,
    sortOrder: maxOrder + 1,
  });

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_CHANGE_ROLE,
    `create_role name=${parsed.data.name} label="${parsed.data.label}" isAdmin=${parsed.data.isAdmin}`,
  );

  revalidatePath(getAdminPath("users-roles"));
  return { success: "Role created" };
}

export async function updateRole(id: number, formData: FormData) {
  const admin = await requireAdmin();

  const [existing] = await db
    .select({ isSystem: roles.isSystem, name: roles.name })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);

  if (!existing) return { error: "Role not found" };

  const parsed = roleSchema.safeParse({
    name: existing.isSystem ? existing.name : formData.get("name"),
    label: formData.get("label"),
    color: formData.get("color"),
    description: formData.get("description") || undefined,
    isAdmin: formData.get("isAdmin") === "true",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db
    .update(roles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(roles.id, id));

  // Sync is_admin for all users with this role
  await db
    .update(users)
    .set({
      isAdmin: parsed.data.isAdmin,
      updatedAt: new Date(),
    })
    .where(eq(users.role, parsed.data.name));

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_CHANGE_ROLE,
    `update_role name=${existing.name} label="${parsed.data.label}" isAdmin=${parsed.data.isAdmin}`,
  );

  revalidatePath(getAdminPath("users-roles"));
  revalidatePath(getAdminPath("users-list"));
  return { success: "Role updated" };
}

export async function deleteRole(id: number) {
  const admin = await requireAdmin();

  const [existing] = await db
    .select({ isSystem: roles.isSystem, name: roles.name })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);

  if (!existing) return { error: "Role not found" };
  if (existing.isSystem) return { error: "System roles cannot be deleted" };

  // Reassign users with this role to 'member'
  await db
    .update(users)
    .set({ role: "member", isAdmin: false, updatedAt: new Date() })
    .where(and(eq(users.role, existing.name), ne(users.role, "member")));

  await db.delete(roles).where(eq(roles.id, id));

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_CHANGE_ROLE,
    `delete_role name=${existing.name}`,
  );

  revalidatePath(getAdminPath("users-roles"));
  revalidatePath(getAdminPath("users-list"));
  return { success: "Role deleted" };
}

export async function setUserRole(userId: string, roleName: string) {
  const admin = await requireAdmin();

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) return { error: "Role not found" };

  const [target] = await db
    .select({ role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.deletedAt) {
    return { error: "This user has been deleted and cannot be modified." };
  }

  await db
    .update(users)
    .set({
      role: roleName,
      isAdmin: role.isAdmin,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_CHANGE_ROLE,
    `set_user_role userId=${userId} from=${target?.role ?? "?"} to=${roleName}`,
  );

  revalidatePath(getAdminPath("users-list"));
  revalidatePath(`${getAdminPath("users-list")}/${userId}`);
  return { success: "Role assigned" };
}
