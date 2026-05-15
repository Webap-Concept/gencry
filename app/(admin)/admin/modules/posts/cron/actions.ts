"use server";

/**
 * Server actions per /admin/modules/posts/cron.
 * Protette dal permesso del modulo (`modules:posts`), e con
 * whitelist sul jobid: si può toggleare solo job di proprietà del
 * modulo Posts (jobname presente nel suo manifest). Questo evita
 * che un bug in UI o un cambio di routing permetta di disabilitare
 * job di altri moduli o del core da una pagina modulo.
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

const MODULE_SLUG = "posts";

async function assertJobBelongsToModule(jobid: number): Promise<void> {
  const owned = getModuleJobnames(MODULE_SLUG);
  const all = await listCronJobs();
  const job = all.find((j) => j.jobid === jobid);
  if (!job || !job.jobname || !owned.has(job.jobname)) {
    throw new Error("Job does not belong to this module.");
  }
}

export async function togglePostsCronJobAction(
  jobid: number,
  active: boolean,
): Promise<CronToggleResult> {
  await requireAdminSectionPage("modules:posts");
  try {
    await assertJobBelongsToModule(jobid);
    await setCronJobActive(jobid, active);
    revalidatePath("/admin/modules/posts/cron");
    return {
      success: `Job ${active ? "enabled" : "disabled"}.`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Toggle failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function fetchPostsCronRunsAction(
  jobid: number,
): Promise<PgCronRun[]> {
  await requireAdminSectionPage("modules:posts");
  await assertJobBelongsToModule(jobid);
  return getRecentRuns(jobid, 20);
}
