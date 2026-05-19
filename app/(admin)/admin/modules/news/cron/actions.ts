"use server";

/**
 * Server actions per /admin/modules/news/cron.
 * Stesso pattern di /admin/modules/posts/cron: permission gate sul modulo +
 * whitelist sul jobid (solo job dichiarati nel manifest news). Difesa
 * in profondità: anche se l'UI tentasse di toggleare un job di altro
 * modulo, qui blocchiamo.
 */
import {
  getRecentRuns,
  listCronJobs,
  setCronJobActive,
  type PgCronRun,
} from "@/lib/cron/queries";
import { getModuleJobnames } from "@/lib/cron/registry";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

export type CronToggleResult =
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

const MODULE_SLUG = "news";

async function assertJobBelongsToModule(jobid: number): Promise<void> {
  const owned = getModuleJobnames(MODULE_SLUG);
  const all = await listCronJobs();
  const job = all.find((j) => j.jobid === jobid);
  if (!job || !job.jobname || !owned.has(job.jobname)) {
    throw new Error("Job does not belong to this module.");
  }
}

export async function toggleNewsCronJobAction(
  jobid: number,
  active: boolean,
): Promise<CronToggleResult> {
  await requireAdminSectionPage("modules:news");
  try {
    await assertJobBelongsToModule(jobid);
    await setCronJobActive(jobid, active);
    revalidatePath("/admin/modules/news/cron");
    return {
      success: `Job ${active ? "enabled" : "disabled"}.`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toggle failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function fetchNewsCronRunsAction(
  jobid: number,
): Promise<PgCronRun[]> {
  await requireAdminSectionPage("modules:news");
  await assertJobBelongsToModule(jobid);
  return getRecentRuns(jobid, 20);
}
