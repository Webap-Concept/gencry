"use server";
// app/(admin)/admin/modules/posts/settings/actions.ts
//
// Server Actions admin-only per la gestione delle settings del modulo
// Posts. Gate RBAC `modules:posts`.

import { revalidatePath } from "next/cache";
import {
  saveReportReasons as saveReasonsHelper,
  type ReportReason,
} from "@/lib/modules/posts/services/report-reasons";
import { requireAdminSectionPage } from "@/lib/rbac/guards";

export type SaveReportReasonsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveReportReasonsAction(
  reasons: ReportReason[],
): Promise<SaveReportReasonsResult> {
  await requireAdminSectionPage("modules:posts");
  try {
    await saveReasonsHelper(reasons);
    revalidatePath("/admin/modules/posts/settings");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "save_failed";
    return { ok: false, error: message };
  }
}
