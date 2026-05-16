/**
 * /admin/modules/posts/cron — vista MODULO dei cron job pg_cron
 * appartenenti al modulo Posts.
 *
 * I metadati (label, descrizione, purpose) provengono dal manifest
 * del modulo (lib/modules/posts/manifest.ts). Se un jobname del
 * manifest non è presente in pg_cron, viene mostrato un avviso
 * "missing in pg_cron" con il `cron.schedule(...)` pronto da incollare
 * nel SQL Editor Supabase.
 */
import {
  CronJobsTable,
  type CronRow,
} from "@/app/(admin)/admin/_components/cron-jobs-table";
import {
  buildExpectedCommandBody,
  buildScheduleStatement,
  commandsMatch,
} from "@/lib/cron/expected-command";
import {
  listCronJobsWithLastRun,
  type PgCronJobWithLastRun,
} from "@/lib/cron/queries";
import { getCronJobMeta, getModuleJobnames } from "@/lib/cron/registry";
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";
import { getSiteUrl } from "@/lib/seo";
import type { Metadata } from "next";
import { fetchPostsCronRunsAction, togglePostsCronJobAction } from "./actions";

export const metadata: Metadata = { title: "Posts / Cron Jobs" };
export const dynamic = "force-dynamic";

export default async function PostsCronPage() {
  let allJobs: PgCronJobWithLastRun[] = [];
  let dbError: string | null = null;
  try {
    allJobs = await listCronJobsWithLastRun();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const owned = getModuleJobnames("posts");
  const presentJobnames = new Set(
    allJobs.map((j) => j.jobname).filter(Boolean) as string[],
  );
  const siteUrl = await getSiteUrl();

  const rows: CronRow[] = allJobs
    .filter((job) => job.jobname && owned.has(job.jobname))
    .map((job) => {
      const meta = getCronJobMeta(job.jobname) ?? null;
      if (!meta?.path || !siteUrl) return { job, meta };
      const expectedBody = buildExpectedCommandBody({
        path: meta.path,
        baseUrl: siteUrl,
      });
      const expectedCommand = meta.schedule
        ? buildScheduleStatement({
            jobname: meta.jobname,
            schedule: meta.schedule,
            path: meta.path,
            baseUrl: siteUrl,
          })
        : expectedBody;
      return {
        job,
        meta,
        expectedCommand,
        commandDrift: !commandsMatch(job.command, expectedBody),
      };
    });

  const missing = POSTS_MODULE.cronJobs
    .filter((c) => !presentJobnames.has(c.jobname))
    .map((c) => ({
      ...c,
      statement: siteUrl
        ? buildScheduleStatement({
            jobname: c.jobname,
            schedule: c.schedule,
            path: c.path,
            baseUrl: siteUrl,
          })
        : null,
    }));

  return (
    <div className="space-y-5">
      {dbError && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background:
              "color-mix(in srgb, var(--gc-neg, #dc2626) 8%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
            color: "var(--gc-neg, #dc2626)",
          }}>
          <p className="font-semibold mb-1">
            Cannot read cron jobs from the database.
          </p>
          <p className="font-mono text-xs">{dbError}</p>
        </div>
      )}

      {missing.length > 0 && (
        <div
          className="rounded-xl p-4 text-xs space-y-3"
          style={{
            background:
              "color-mix(in srgb, #d97706 8%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, #d97706 30%, transparent)",
            color: "#d97706",
          }}>
          <p className="font-semibold">Missing jobs</p>
          <p>
            The module manifest declares the following jobs that are NOT
            registered in pg_cron. Run the matching{" "}
            <code>cron.schedule(...)</code> in the Supabase SQL Editor to
            activate them — the URL is rebuilt from your current site domain.
          </p>
          {!siteUrl && (
            <p className="font-semibold">
              Site domain is not configured. Set it in Settings → General before
              installing missing cron jobs, otherwise the schedule statement
              cannot be generated.
            </p>
          )}
          <ul className="space-y-3">
            {missing.map((c) => (
              <li key={c.jobname}>
                <p className="font-mono">
                  {c.jobname}{" "}
                  <span style={{ color: "var(--admin-text-faint)" }}>
                    · {c.schedule} · {c.path}
                  </span>
                </p>
                {c.statement && (
                  <pre
                    className="text-[11px] font-mono p-2 rounded overflow-x-auto whitespace-pre-wrap break-all mt-1.5"
                    style={{
                      background: "var(--admin-card-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text-muted)",
                    }}>
                    {c.statement}
                  </pre>
                )}
              </li>
            ))}
          </ul>
          {siteUrl && (
            <p style={{ color: "var(--admin-text-faint)" }}>
              Replace <code>&lt;CRON_SECRET&gt;</code> with the real bearer
              secret before running.
            </p>
          )}
        </div>
      )}

      <CronJobsTable
        rows={rows}
        toggleAction={togglePostsCronJobAction}
        fetchRunsAction={fetchPostsCronRunsAction}
        emptyMessage="No Posts cron jobs are currently registered in pg_cron."
      />
    </div>
  );
}
