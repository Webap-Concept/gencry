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
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendUserDeletedEmail } from "@/lib/email/templates/user-deleted";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export async function banUser(userId: string, reason?: string) {
  await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const [target] = await db
    .select({ isAdmin: users.isAdmin, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.isAdmin) {
    throw new Error(t("cannotBanAdmin"));
  }

  if (target?.deletedAt) {
    throw new Error(t("alreadyDeleted"));
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
  const t = await getTranslations("admin.access.users.actionErrors");

  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.deletedAt) {
    throw new Error(t("alreadyDeleted"));
  }

  await db
    .update(users)
    .set({ bannedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath(getAdminPath("users-list"));
}

export async function deleteUser(userId: string) {
  const adminUser = await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const allowed = await can(adminUser, "users:delete");
  if (!allowed) throw new Error(t("missingDeletePermission"));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: userProfiles.firstName,
      isAdmin: users.isAdmin,
      deletedAt: users.deletedAt,
      locale: users.locale,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) throw new Error(t("userNotFound"));
  if (target.isAdmin) throw new Error(t("cannotDeleteAdmin"));
  if (target.deletedAt) throw new Error(t("userAlreadyDeleted"));

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
    const locale = await resolveRecipientLocale(target.locale);
    await sendUserDeletedEmail(
      target.email,
      target.firstName ?? null,
      deletedAt,
      locale,
    );
  } catch (emailError) {
    console.error("[deleteUser] Error sending email:", emailError);
  }

  revalidatePath(getAdminPath("users-list"));
}

/**
 * Cancel a pending soft-delete (admin-side restore). Mirror operation of
 * `deleteUser`: clears `users.deleted_at` so the user can sign in again
 * and the `soft-deleted-purge` cron stops targeting the row.
 *
 * Gated by `users:delete` (same permission as the destructive direction):
 * whoever can delete an account is the same actor who should be allowed
 * to roll back the request before the 30-day grace expires.
 */
export async function cancelUserDeletion(userId: string) {
  const adminUser = await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const allowed = await can(adminUser, "users:delete");
  if (!allowed) throw new Error(t("missingDeletePermission"));

  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) throw new Error(t("userNotFound"));
  if (!target.deletedAt) throw new Error(t("userNotPendingDeletion"));

  const now = new Date();

  await db
    .update(users)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(users.id, userId));

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_CANCEL_USER_DELETION,
    timestamp: now,
  });

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
