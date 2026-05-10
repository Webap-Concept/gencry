"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { activityLogs, ActivityType, roles, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import { and, eq, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { DASHBOARD_WIDGETS_META } from "@/app/(admin)/admin/_widgets/meta";

/** Parse the dashboard preset fields from the role form payload.
 *  Returns the value to persist into roles.dashboard_widgets:
 *    - null  → no override, use registry defaults
 *    - { enabled } → exact preset (sanitized against the registry) */
function parseDashboardPresetFromFormData(
  fd: FormData,
): { enabled: string[] } | null {
  const override = fd.get("dashboardWidgetsOverride") === "true";
  if (!override) return null;

  const raw = fd.get("dashboardWidgetsEnabled");
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) return { enabled: [] };

  const validIds = new Set(DASHBOARD_WIDGETS_META.map((w) => w.id));
  const seen = new Set<string>();
  const enabled: string[] = [];
  for (const id of parsed) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    enabled.push(id);
  }
  return { enabled };
}

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
    .min(2, "minLength2")
    .max(50)
    .regex(/^[a-z0-9_-]+$/, "slugFormat"),
  label: z.string().min(2, "minLength2").max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalidColor"),
  description: z.string().max(300).optional(),
  /**
   * isAdmin = true only for the system "admin" role.
   * For all other access, use RBAC permissions (e.g., admin:access).
   * Emergency flag: bypasses the RBAC system.
   */
  isAdmin: z.boolean().default(false),
});

async function translateSchemaError(message: string): Promise<string> {
  const t = await getTranslations("admin.access.roles.errors");
  if (
    message === "minLength2" ||
    message === "slugFormat" ||
    message === "invalidColor"
  ) {
    return t(message);
  }
  return message;
}

export async function createRole(formData: FormData) {
  const admin = await requireAdmin();
  const tSuccess = await getTranslations("admin.access.roles.successMessages");

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    label: formData.get("label"),
    color: formData.get("color"),
    description: formData.get("description") || undefined,
    isAdmin: formData.get("isAdmin") === "true",
  });

  if (!parsed.success) {
    return { error: await translateSchemaError(parsed.error.issues[0].message) };
  }

  const allRoles = await getAdminRoles();
  const maxOrder = allRoles.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const dashboardWidgets = parseDashboardPresetFromFormData(formData);

  await db.insert(roles).values({
    ...parsed.data,
    isSystem: false,
    sortOrder: maxOrder + 1,
    dashboardWidgets,
  });

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_CHANGE_ROLE,
    `create_role name=${parsed.data.name} label="${parsed.data.label}" isAdmin=${parsed.data.isAdmin}`,
  );

  revalidatePath(await getAdminPath("users-roles"));
  return { success: tSuccess("created") };
}

export async function updateRole(id: number, formData: FormData) {
  const admin = await requireAdmin();
  const tErrors = await getTranslations("admin.access.roles.errors");
  const tSuccess = await getTranslations("admin.access.roles.successMessages");

  const [existing] = await db
    .select({ isSystem: roles.isSystem, name: roles.name })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);

  if (!existing) return { error: tErrors("roleNotFound") };

  const parsed = roleSchema.safeParse({
    name: existing.isSystem ? existing.name : formData.get("name"),
    label: formData.get("label"),
    color: formData.get("color"),
    description: formData.get("description") || undefined,
    isAdmin: formData.get("isAdmin") === "true",
  });

  if (!parsed.success) {
    return { error: await translateSchemaError(parsed.error.issues[0].message) };
  }

  const dashboardWidgets = parseDashboardPresetFromFormData(formData);

  await db
    .update(roles)
    .set({ ...parsed.data, dashboardWidgets, updatedAt: new Date() })
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

  revalidatePath(await getAdminPath("users-roles"));
  revalidatePath(await getAdminPath("users-list"));
  return { success: tSuccess("updated") };
}

export async function deleteRole(id: number) {
  const admin = await requireAdmin();
  const tErrors = await getTranslations("admin.access.roles.errors");
  const tSuccess = await getTranslations("admin.access.roles.successMessages");

  const [existing] = await db
    .select({ isSystem: roles.isSystem, name: roles.name })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);

  if (!existing) return { error: tErrors("roleNotFound") };
  if (existing.isSystem) return { error: tErrors("cannotDeleteSystem") };

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

  revalidatePath(await getAdminPath("users-roles"));
  revalidatePath(await getAdminPath("users-list"));
  return { success: tSuccess("deleted") };
}

export async function setUserRole(userId: string, roleName: string) {
  const admin = await requireAdmin();
  const tErrors = await getTranslations("admin.access.roles.errors");
  const tSuccess = await getTranslations("admin.access.roles.successMessages");

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) return { error: tErrors("roleNotFound") };

  const [target] = await db
    .select({ role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.deletedAt) {
    return { error: tErrors("userDeleted") };
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

  revalidatePath(await getAdminPath("users-list"));
  revalidatePath(`${await getAdminPath("users-list")}/${userId}`);
  return { success: tSuccess("assigned") };
}
