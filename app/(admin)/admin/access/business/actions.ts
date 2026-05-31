"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  approveBusinessRequest,
  rejectBusinessRequest,
  type ReviewRecipient,
} from "@/lib/account/business-profile";
import { db } from "@/lib/db/drizzle";
import { activityLogs } from "@/lib/db/schema";
import { invalidateAuthorPostsCache } from "@/lib/modules/posts/queries";
import { sendBusinessApprovedEmail } from "@/lib/email/templates/business-approved";
import { sendBusinessRejectedEmail } from "@/lib/email/templates/business-rejected";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
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
  // Il badge/nome business sono denormalizzati nella post-cache: invalidare
  // i post dell'utente così il feed riflette subito l'approvazione.
  await invalidateAuthorPostsCache(res.recipient.userId);
  await sendReviewEmail("approved", res.recipient, null);
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
  await sendReviewEmail("rejected", res.recipient, note);
  revalidatePath(await getAdminPath("users-business"));
  return { ok: true };
}

/**
 * Invia la mail di esito al richiedente. Fail-safe: un errore di invio NON
 * fa fallire l'approvazione/rifiuto (già persistiti) — viene solo loggato.
 */
async function sendReviewEmail(
  outcome: "approved" | "rejected",
  recipient: ReviewRecipient,
  note: string | null,
): Promise<void> {
  if (!recipient.email) return;
  try {
    const locale = await resolveRecipientLocale(recipient.locale);
    if (outcome === "approved") {
      await sendBusinessApprovedEmail({
        to: recipient.email,
        userName: recipient.firstName ?? undefined,
        companyName: recipient.companyName,
        locale,
      });
    } else {
      await sendBusinessRejectedEmail({
        to: recipient.email,
        userName: recipient.firstName ?? undefined,
        companyName: recipient.companyName,
        reason: note,
        locale,
      });
    }
  } catch (err) {
    console.error(`[business] ${outcome} email failed:`, err);
  }
}
