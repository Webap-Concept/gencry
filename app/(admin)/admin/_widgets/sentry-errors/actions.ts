"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import {
  markSentryIssueAsResolved,
  SENTRY_ISSUES_TAG,
} from "@/lib/sentry/issues";

// Sentry issue ids look like "12345" (numeric string) or in some
// org-scoped contexts "PROJECT-1A". We accept any non-empty short string
// and let Sentry's API validate the actual format.
const issueIdSchema = z.string().min(1).max(64);

export type ResolveSentryIssueResult =
  | { success: true }
  | { error: "invalid_payload" | "forbidden" | "missing_env" | "scope_insufficient" | "network" | "unknown" };

/**
 * Marks a Sentry issue as resolved. Permission gate: `admin:sentry`
 * (super admins bypass via requireAdmin's RBAC handling).
 *
 * On success the SENTRY_ISSUES_TAG is revalidated so the next render of
 * the widget reads fresh data from the cache wrapper.
 */
export async function resolveSentryIssue(
  issueId: string,
): Promise<ResolveSentryIssueResult> {
  const user = await requireAdmin();

  // The widget itself is RBAC-gated, but server actions are reachable
  // independently of the widget being mounted. Re-check explicitly.
  if (!user.isAdmin) {
    const allowed = await can(user, "admin:sentry");
    if (!allowed) return { error: "forbidden" };
  }

  const parsed = issueIdSchema.safeParse(issueId);
  if (!parsed.success) return { error: "invalid_payload" };

  const result = await markSentryIssueAsResolved(parsed.data);
  if (!result.ok) {
    return { error: result.reason };
  }

  // Next 16: inside a Server Action we use updateTag (single-arg) for
  // read-your-own-writes semantics — revalidateTag requires 2 args here.
  updateTag(SENTRY_ISSUES_TAG);
  return { success: true };
}
