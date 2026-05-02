"use server";

/**
 * Server actions per la sezione /admin/settings/cron.
 * Tutte protette da `admin:settings`.
 *
 * Le azioni qui agiscono SU TUTTI i job, ma il filtro modulo/core
 * avviene a livello di pagina (le azioni in sé non hanno contesto
 * di proprietà). Manteniamo questo "low-level access" anche per il
 * core perché la sezione "Untracked" deve poter toggleare job che
 * non sono in nessun manifest.
 */
import { getRecentRuns, setCronJobActive, type PgCronRun } from "@/lib/cron/queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

export type CronToggleResult =
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function toggleCronJobAction(
  jobid: number,
  active: boolean,
): Promise<CronToggleResult> {
  await requireAdminSectionPage("admin:settings");
  try {
    await setCronJobActive(jobid, active);
    revalidatePath("/admin/settings/cron");
    return {
      success: `Job ${active ? "enabled" : "disabled"}.`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toggle failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function fetchCronRunsAction(jobid: number): Promise<PgCronRun[]> {
  await requireAdminSectionPage("admin:settings");
  return getRecentRuns(jobid, 20);
}
