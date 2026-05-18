"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  notifications,
  roles,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendUserDeletedEmail } from "@/lib/email/templates/user-deleted";
import { sendModerationStrikeRevokedEmail } from "@/lib/email/templates/moderation-strike-revoked";
import { can } from "@/lib/rbac/can";
import { requireAdmin, requireAdminSectionPage } from "@/lib/rbac/guards";
import { revokeStrike } from "@/lib/auth/strikes";
import { getUser } from "@/lib/db/queries";
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
  revalidatePath(await getAdminPath("users-list"));
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
  revalidatePath(await getAdminPath("users-list"));
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

  revalidatePath(await getAdminPath("users-list"));
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

  revalidatePath(await getAdminPath("users-list"));
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

  revalidatePath(await getAdminPath("users-list"));
}

// ─────────────────────────────────────────────────────────────────────────
// Strike revoke: usato dal blocco "Strike history" nel user detail page.
// Gated `modules:posts.moderate` (decisione utente — chi può emettere
// strike può anche revocarli, no super-admin separato in V1).
// ─────────────────────────────────────────────────────────────────────────

export type RevokeUserStrikeResult =
  | { ok: true; activeCount: number; unbannedNow: boolean }
  | { ok: false; error: string };

export async function revokeUserStrikeAction(
  strikeId: string,
  note?: string,
): Promise<RevokeUserStrikeResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { usersStrikes } = await import("@/lib/db/schema");

  // Risolvi userId target PRIMA del revoke (mi serve per la notifica
  // anche se idempotent skippa l'update).
  const [target] = await db
    .select({ userId: usersStrikes.userId })
    .from(usersStrikes)
    .where(eq(usersStrikes.id, strikeId))
    .limit(1);
  if (!target) return { ok: false, error: "strike_not_found" };

  const result = await revokeStrike({
    strikeId,
    revokedBy: user.id,
    note: note?.trim() || null,
  });
  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  // Notifica utente solo se la revoca era davvero "nuova".
  if (!result.alreadyRevoked) {
    try {
      await db.insert(notifications).values({
        userId: target.userId,
        type: "moderation.strike_revoked",
        actorId: user.id,
        payload: {
          active_count_after: result.activeStrikesCount,
          unbanned: result.unbannedNow,
        },
      });
    } catch (err) {
      console.warn("[revokeUserStrikeAction] notification failed:", err);
    }

    // Email transazionale best-effort (fail non rolla la revoke).
    try {
      const [recipient] = await db
        .select({
          email: users.email,
          userLocale: users.locale,
          firstName: userProfiles.firstName,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, target.userId))
        .limit(1);
      if (recipient?.email) {
        const locale = await resolveRecipientLocale(recipient.userLocale);
        await sendModerationStrikeRevokedEmail({
          to: recipient.email,
          userName: recipient.firstName ?? undefined,
          activeCountAfter: result.activeStrikesCount,
          unbanned: result.unbannedNow,
          locale,
        });
      }
    } catch (err) {
      console.warn("[revokeUserStrikeAction] email failed:", err);
    }
  }

  revalidatePath(await getAdminPath("users-list"));
  return {
    ok: true,
    activeCount: result.activeStrikesCount,
    unbannedNow: result.unbannedNow,
  };
}
