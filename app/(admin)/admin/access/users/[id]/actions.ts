"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { resetMfaForAdmin } from "@/lib/auth/mfa/queries";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import {
  activityLogs,
  ActivityType,
  permissions,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendMfaAdminResetEmail } from "@/lib/email/templates/mfa-admin-reset";
import {
  addUserPermissionOverride,
  purgeExpiredOverrides,
  removeUserPermissionOverride,
} from "@/lib/rbac/permissions-queries";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
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

const OverrideSchema = z
  .object({
    userId: z.string().uuid(),
    permissionId: z.coerce.number().int().positive(),
    granted: z.string().transform((v) => v === "true"),
    reason: z.string().max(500).optional(),
    /**
     * Two separate fields are received:
     * - expiresAt: datetime-local string (e.g. "2026-04-09T08:10") — browser local time
     * - tzOffset: offset in minutes from UTC (e.g. -180 for EEST UTC+3)
     *
     * Convert to UTC by adding the offset:
     *   utcMs = localMs + offsetMinutes * 60_000
     */
    expiresAt: z.string().optional(),
    tzOffset: z.coerce.number().default(0),
  })
  .transform((data) => {
    let expiresAt: Date | undefined;
    if (data.expiresAt && data.expiresAt.trim() !== "") {
      // new Date("2026-04-09T08:10") is parsed as UTC in Node — correct with the offset
      const localMs = new Date(data.expiresAt).getTime();
      // tzOffset is negative for UTC+ (JS getTimezoneOffset convention)
      expiresAt = new Date(localMs + data.tzOffset * 60_000);
    }
    return { ...data, expiresAt };
  });

async function assertUserNotDeleted(userId: string) {
  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (target?.deletedAt) {
    const t = await getTranslations("admin.access.users.detail");
    return t("actionUserDeleted");
  }
  return null;
}

export async function addOverride(formData: FormData) {
  const t = await getTranslations("admin.access.users.detail");
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: t("actionUnauthorized") };

  const parsed = OverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { userId, permissionId, granted, reason, expiresAt } = parsed.data;

  const blocked = await assertUserNotDeleted(userId);
  if (blocked) return { error: blocked };

  // Recupera la key del permesso per il log
  const [perm] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, permissionId))
    .limit(1);

  await addUserPermissionOverride({
    userId,
    permissionId,
    granted,
    grantedBy: admin.id,
    reason,
    expiresAt,
  });

  await logRbacAction(
    admin.id,
    granted ? ActivityType.PERMISSION_GRANTED : ActivityType.PERMISSION_REVOKED,
    `user_override userId=${userId} perm=${perm?.key ?? permissionId} granted=${granted}` +
      (expiresAt ? ` expires=${expiresAt.toISOString()}` : "") +
      (reason ? ` reason="${reason}"` : ""),
  );

  revalidatePath(`${getAdminPath("users-list")}/${userId}`);

  return { success: true };
}

export async function removeOverride(overrideId: number, userId: string) {
  const t = await getTranslations("admin.access.users.detail");
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: t("actionUnauthorized") };

  const blocked = await assertUserNotDeleted(userId);
  if (blocked) return { error: blocked };

  await removeUserPermissionOverride(overrideId);

  await logRbacAction(
    admin.id,
    ActivityType.PERMISSION_REVOKED,
    `remove_override overrideId=${overrideId} userId=${userId}`,
  );

  revalidatePath(`${getAdminPath("users-list")}/${userId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin reset MFA
//
// Wipes user_mfa_totp + mfa_recovery_codes for the target user. Sends a
// notification email (with the admin's stated reason) and writes an audit
// log entry. Used when the user lost both phone and recovery codes and
// reached out to support.
// ---------------------------------------------------------------------------

const AdminResetMfaSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3, "reasonRequired").max(500),
});

export async function adminResetMfa(formData: FormData) {
  const t = await getTranslations("admin.access.users.detail");
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: t("actionUnauthorized") };

  const parsed = AdminResetMfaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const msg = parsed.error.issues[0].message;
    return {
      error: msg === "reasonRequired" ? t("actionReasonRequired") : msg,
    };
  }

  const { userId, reason } = parsed.data;

  const blocked = await assertUserNotDeleted(userId);
  if (blocked) return { error: blocked };

  const [target] = await db
    .select({ email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return { error: t("actionUserNotFound") };

  await resetMfaForAdmin(userId);

  await logRbacAction(
    admin.id,
    ActivityType.ADMIN_RESET_MFA,
    `target=${userId} reason="${reason.replace(/"/g, '\\"')}"`,
  );

  const locale = await resolveRecipientLocale(target.locale);

  // Email notification — fire-and-forget, non bloccare la response.
  void (async () => {
    try {
      const [profile] = await db
        .select({ firstName: userProfiles.firstName })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      await sendMfaAdminResetEmail(
        target.email,
        reason,
        profile?.firstName ?? undefined,
        locale,
      );
    } catch (err: unknown) {
      console.error("[adminResetMfa] sendMfaAdminResetEmail failed:", err);
    }
  })();

  revalidatePath(`${getAdminPath("users-list")}/${userId}`);
  return { success: true };
}

/**
 * Deletes all expired overrides for the user.
 * Called both manually from the UI button and automatically on page load.
 */
export async function purgeExpired(userId: string) {
  const t = await getTranslations("admin.access.users.detail");
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: t("actionUnauthorized") };

  const blocked = await assertUserNotDeleted(userId);
  if (blocked) return { error: blocked };

  const deleted = await purgeExpiredOverrides(userId);

  if (deleted > 0) {
    await logRbacAction(
      admin.id,
      ActivityType.PERMISSION_REVOKED,
      `purge_expired_overrides userId=${userId} deleted=${deleted}`,
    );
  }

  revalidatePath(`${getAdminPath("users-list")}/${userId}`);
  return { success: true, deleted };
}
