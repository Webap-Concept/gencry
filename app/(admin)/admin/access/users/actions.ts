"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  roles,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { sendUserDeletedEmail } from "@/lib/email/templates/user-deleted";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function banUser(userId: string, reason?: string) {
  await requireAdmin();

  const [target] = await db
    .select({ isAdmin: users.isAdmin, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.isAdmin) {
    throw new Error("You cannot suspend an admin.");
  }

  if (target?.deletedAt) {
    throw new Error("This user has been deleted and cannot be modified.");
  }

  await db
    .update(users)
    .set({
      bannedAt: new Date(),
      bannedReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  revalidatePath(getAdminPath("users-list"));
}

export async function unbanUser(userId: string) {
  await requireAdmin();

  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.deletedAt) {
    throw new Error("This user has been deleted and cannot be modified.");
  }

  await db
    .update(users)
    .set({ bannedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath(getAdminPath("users-list"));
}

export async function deleteUser(userId: string) {
  const adminUser = await requireAdmin();

  const allowed = await can(adminUser, "users:delete");
  if (!allowed) throw new Error("You do not have the users:delete permission.");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: userProfiles.firstName,
      isAdmin: users.isAdmin,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) throw new Error("User not found.");
  if (target.isAdmin) throw new Error("You cannot delete an admin account.");
  if (target.deletedAt) throw new Error("User already deleted.");

  const deletedAt = new Date();

  await db
    .update(users)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(eq(users.id, userId));

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_DELETE_USER,
    timestamp: deletedAt,
  });

  try {
    await sendUserDeletedEmail(
      target.email,
      target.firstName ?? null,
      deletedAt,
    );
  } catch (emailError) {
    console.error("[deleteUser] Error sending email:", emailError);
  }

  revalidatePath(getAdminPath("users-list"));
}

/** @deprecated Use setUserRole in /admin/roles/actions.ts */
export async function changeUserRole(userId: string, roleName: string) {
  await requireAdmin();

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  await db
    .update(users)
    .set({
      role: roleName,
      isAdmin: role?.isAdmin ?? false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath(getAdminPath("users-list"));
}
