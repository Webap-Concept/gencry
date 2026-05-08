"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { invalidateDependencyCache } from "@/lib/admin/dependencies/registry";
import { can } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

/**
 * Forza il rebuild del DependencyReport (invalida la cache 6h e rerendera
 * la pagina). Usata dal bottone "Refresh" — può essere lenta (~5-10s a
 * cache fredda perché ricarica tutti i metadata da npm e GitHub).
 */
export async function refreshDependencyReportAction(): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user.isAdmin && !(await can(user, "admin:settings"))) {
    return { error: "Not authorized", timestamp: Date.now() };
  }
  invalidateDependencyCache();
  revalidatePath(await getAdminPath("services-dependencies"));
  return { success: "Report refreshed.", timestamp: Date.now() };
}
