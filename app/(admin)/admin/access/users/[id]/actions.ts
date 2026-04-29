"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import {
  activityLogs,
  ActivityType,
  permissions,
  users,
} from "@/lib/db/schema";
import {
  addUserPermissionOverride,
  purgeExpiredOverrides,
  removeUserPermissionOverride,
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
    return "This user has been deleted and cannot be modified.";
  }
  return null;
}

export async function addOverride(formData: FormData) {
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: "Unauthorized" };

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
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: "Unauthorized" };

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

/**
 * Deletes all expired overrides for the user.
 * Called both manually from the UI button and automatically on page load.
 */
export async function purgeExpired(userId: string) {
  const admin = await getUser();
  if (!admin || !admin.isAdmin) return { error: "Unauthorized" };

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
