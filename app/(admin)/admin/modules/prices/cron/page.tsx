/**
 * /admin/modules/prices/cron — vista MODULO dei cron job pg_cron
 * appartenenti al modulo Prices Engine.
 *
 * I metadati (label, descrizione, purpose) provengono dal manifest
 * del modulo (lib/modules/prices/manifest.ts). Se un jobname del
 * manifest non è presente in pg_cron, viene mostrato un avviso
 * "missing in pg_cron" così sai che la cron.schedule(...) non è
 * stata ancora eseguita.
 */
import {
  CronJobsTable,
  type CronRow,
} from "@/app/(admin)/admin/_components/cron-jobs-table";
import { listCronJobsWithLastRun, type PgCronJobWithLastRun } from "@/lib/cron/queries";
import { getCronJobMeta, getModuleJobnames } from "@/lib/cron/registry";
import { PRICES_MODULE } from "@/lib/modules/prices/manifest";
import type { Metadata } from "next";
import { fetchPricesCronRunsAction, togglePricesCronJobAction } from "./actions";

export const metadata: Metadata = { title: "Prices / Cron Jobs" };
export const dynamic = "force-dynamic";

export default async function PricesCronPage() {
  let allJobs: PgCronJobWithLastRun[] = [];
  let dbError: string | null = null;
  try {
    allJobs = await listCronJobsWithLastRun();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const owned = getModuleJobnames("prices");
  const presentJobnames = new Set(allJobs.map((j) => j.jobname).filter(Boolean) as string[]);

  const rows: CronRow[] = allJobs
    .filter((job) => job.jobname && owned.has(job.jobname))
    .map((job) => ({ job, meta: getCronJobMeta(job.jobname) ?? null }));

  const missing = PRICES_MODULE.cronJobs.filter((c) => !presentJobnames.has(c.jobname));

  return (
    <div className="space-y-5">
      {dbError && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: "color-mix(in srgb, var(--gc-neg, #dc2626) 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
            color: "var(--gc-neg, #dc2626)",
          }}>
          <p className="font-semibold mb-1">Cannot read cron jobs from the database.</p>
          <p className="font-mono text-xs">{dbError}</p>
        </div>
      )}

      {missing.length > 0 && (
        <div
          className="rounded-xl p-4 text-xs"
          style={{
            background: "color-mix(in srgb, #d97706 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #d97706 30%, transparent)",
            color: "#d97706",
          }}>
          <p className="font-semibold mb-1">Missing jobs</p>
          <p>
            The module manifest declares the following jobs that are NOT registered
            in pg_cron. Run the matching <code>cron.schedule(...)</code> in the
            Supabase SQL Editor to activate them:
          </p>
          <ul className="mt-2 space-y-1 font-mono">
            {missing.map((c) => (
              <li key={c.jobname}>
                {c.jobname} <span style={{ color: "var(--admin-text-faint)" }}>· {c.schedule} · {c.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CronJobsTable
        rows={rows}
        toggleAction={togglePricesCronJobAction}
        fetchRunsAction={fetchPricesCronRunsAction}
        emptyMessage="No Prices Engine cron jobs are currently registered in pg_cron."
      />
    </div>
  );
}
