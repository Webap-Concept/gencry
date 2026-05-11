"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  permissions,
  rolePermissions,
  roles,
  staffInvitations,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { sendStaffInvitationEmail } from "@/lib/email/templates/staff-invitation";
import { requireAdmin } from "@/lib/rbac/guards";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

/**
 * Writes a record to activity_logs with the requester's IP. Mirrors
 * the helper used by access/permissions/actions.ts,
 * access/roles/actions.ts and access/users/[id]/actions.ts. When the
 * three copies diverge we should hoist this into lib/rbac/activity-log.ts
 * — for now we keep parity with the existing pattern.
 */
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

type StaffRole = { isAdmin: boolean; label: string } | null;

/** Ritorna il ruolo solo se è assegnabile allo staff (isAdmin=true OR ha almeno un permesso admin:*). */
async function getStaffRole(roleName: string): Promise<StaffRole> {
  const [row] = await db
    .select({ isAdmin: roles.isAdmin, label: roles.label })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!row) return null;
  if (row.isAdmin) return row;

  const [perm] = await db
    .select({ id: rolePermissions.permissionId })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(
        eq(roles.name, roleName),
        sql`${permissions.key} LIKE 'admin:%'`,
      ),
    )
    .limit(1);

  return perm ? row : null;
}

export async function changeStaffRole(userId: string, roleName: string) {
  const admin = await requireAdmin();
  const t = await getTranslations("admin.access.staff.errors");

  const role = await getStaffRole(roleName);
  if (!role) throw new Error(t("roleNotAssignable"));

  // Capture the previous role for the audit detail — a "role X → Y"
  // log line is far more useful than "role set to Y" when reviewing.
  const [prev] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({ role: roleName, isAdmin: role.isAdmin, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_GRANTED,
    `change_staff_role user=${userId} from=${prev?.role ?? "?"} to=${roleName}`,
  );

  revalidatePath(await getAdminPath("users-staff"));
}

export type UserSearchResult = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
};

export async function searchNonAdminUsers(
  query: string,
): Promise<UserSearchResult[]> {
  await requireAdmin();

  const q = query.trim();
  if (q.length < 2) return [];

  return db
    .select({
      id: users.id,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      email: users.email,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        isNull(users.deletedAt),
        sql`${users.isAdmin} = false`,
        sql`(
          ${users.email} ILIKE ${"%" + q + "%"} OR
          ${userProfiles.firstName} ILIKE ${"%" + q + "%"} OR
          ${userProfiles.lastName} ILIKE ${"%" + q + "%"}
        )`,
      ),
    )
    .limit(8);
}

export async function addUserToStaff(userId: string, roleName: string) {
  const admin = await requireAdmin();
  const t = await getTranslations("admin.access.staff.errors");

  const role = await getStaffRole(roleName);
  if (!role) throw new Error(t("roleNotAssignable"));

  await db
    .update(users)
    .set({ role: roleName, isAdmin: role.isAdmin, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_GRANTED,
    `add_to_staff user=${userId} role=${roleName}`,
  );

  revalidatePath(await getAdminPath("users-staff"));
}

export async function inviteStaffMember(
  email: string,
  roleName: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const t = await getTranslations("admin.access.staff.errors");

  const emailParsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!emailParsed.success) return { error: t("invalidEmail") };
  const normalizedEmail = emailParsed.data;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    return { error: t("emailAlreadyRegistered") };
  }

  const role = await getStaffRole(roleName);
  if (!role) return { error: t("roleNotAssignable") };

  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await db.insert(staffInvitations).values({
    email: normalizedEmail,
    role: roleName,
    token,
    invitedBy: admin.id,
    expiresAt,
  });

  const inviterName =
    [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
    "Un amministratore";

  try {
    await sendStaffInvitationEmail(
      normalizedEmail,
      token,
      role.label,
      inviterName,
    );
  } catch (err) {
    console.error("[inviteStaffMember] sendStaffInvitationEmail failed:", err);
  }

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_GRANTED,
    `invite_staff email=${normalizedEmail} role=${roleName}`,
  );

  revalidatePath(await getAdminPath("users-staff"));
  return {};
}
