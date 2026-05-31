"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  approveBusinessRequest,
  rejectBusinessRequest,
} from "@/lib/account/business-profile";
import { db } from "@/lib/db/drizzle";
import { activityLogs } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type BusinessReviewActionResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "already_reviewed" | "invalid" };

async function logAction(adminId: string, detail: string): Promise<void> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  await db.insert(activityLogs).values({
    userId: adminId,
    action: detail,
    ipAddress: ip,
  });
}

export async function approveBusinessRequestAction(
  requestId: string,
): Promise<BusinessReviewActionResult> {
  const admin = await requireAdmin();
  if (!requestId) return { ok: false, error: "invalid" };

  const res = await approveBusinessRequest(requestId, admin.id);
  if (!res.ok) return { ok: false, error: res.error };

  await logAction(admin.id, `business.approve | ${requestId}`);
  revalidatePath(await getAdminPath("users-business"));
  return { ok: true };
}

export async function rejectBusinessRequestAction(
  requestId: string,
  note: string | null,
): Promise<BusinessReviewActionResult> {
  const admin = await requireAdmin();
  if (!requestId) return { ok: false, error: "invalid" };

  const res = await rejectBusinessRequest(requestId, admin.id, note);
  if (!res.ok) return { ok: false, error: res.error };

  await logAction(admin.id, `business.reject | ${requestId}`);
  revalidatePath(await getAdminPath("users-business"));
  return { ok: true };
}
