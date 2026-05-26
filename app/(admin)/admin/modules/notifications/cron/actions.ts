"use server";

/**
 * Server actions per /admin/modules/notifications/cron.
 * Protette dal permesso del modulo (`modules:notifications`), e con
 * whitelist sul jobid: si può toggleare solo job di proprietà del
 * modulo Notifications (jobname presente nel suo manifest).
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

const MODULE_SLUG = "notifications";

async function assertJobBelongsToModule(jobid: number): Promise<void> {
  const owned = getModuleJobnames(MODULE_SLUG);
  const all = await listCronJobs();
  const job = all.find((j) => j.jobid === jobid);
  if (!job || !job.jobname || !owned.has(job.jobname)) {
    throw new Error("Job does not belong to this module.");
  }
}

export async function toggleNotificationsCronJobAction(
  jobid: number,
  active: boolean,
): Promise<CronToggleResult> {
  await requireAdminSectionPage("modules:notifications");
  try {
    await assertJobBelongsToModule(jobid);
    await setCronJobActive(jobid, active);
    revalidatePath("/admin/modules/notifications/cron");
    return {
      success: `Job ${active ? "enabled" : "disabled"}.`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toggle failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function fetchNotificationsCronRunsAction(
  jobid: number,
): Promise<PgCronRun[]> {
  await requireAdminSectionPage("modules:notifications");
  await assertJobBelongsToModule(jobid);
  return getRecentRuns(jobid, 20);
}
