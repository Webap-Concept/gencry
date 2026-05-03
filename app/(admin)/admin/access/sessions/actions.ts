"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  revokeAllUserSessions as revokeAllUserSessionsHelper,
  revokeSession as revokeSessionHelper,
} from "@/lib/auth/sessions";
import { db } from "@/lib/db/drizzle";
import { ActivityType, activityLogs } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

async function requireSessionsPermission() {
  const adminUser = await requireAdmin();
  if (!adminUser.isAdmin) {
    const allowed = await can(adminUser, "admin:sessions");
    if (!allowed) {
      throw new Error("You do not have the admin:sessions permission.");
    }
  }
  return adminUser;
}

export async function revokeUserSessionAdmin(sessionId: string) {
  const adminUser = await requireSessionsPermission();

  await revokeSessionHelper(sessionId);

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_REVOKE_SESSION,
    timestamp: new Date(),
  });

  revalidatePath(getAdminPath("users-sessions"));
}

export async function revokeAllSessionsForUserAdmin(userId: string) {
  const adminUser = await requireSessionsPermission();

  const { revokedCount } = await revokeAllUserSessionsHelper({ userId });

  if (revokedCount > 0) {
    await db.insert(activityLogs).values({
      userId: adminUser.id,
      action: ActivityType.ADMIN_REVOKE_ALL_USER_SESSIONS,
      timestamp: new Date(),
    });
  }

  revalidatePath(getAdminPath("users-sessions"));
  revalidatePath(`/admin/access/users/${userId}`);

  return { revokedCount };
}

/**
 * Bulk revoke from the global sessions table. Skips sessions the helper
 * deems already revoked (idempotent). Returns the count of rows the
 * server actually flipped.
 */
export async function revokeSessionsBulkAdmin(sessionIds: string[]) {
  const adminUser = await requireSessionsPermission();

  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return { revokedCount: 0 };
  }

  // The helper is incidentally idempotent (UPDATE with revoked_at IS NULL
  // condition), so concurrent revokes don't double-count.
  await Promise.all(sessionIds.map((id) => revokeSessionHelper(id)));

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_REVOKE_SESSION,
    timestamp: new Date(),
  });

  revalidatePath(getAdminPath("users-sessions"));

  return { revokedCount: sessionIds.length };
}
