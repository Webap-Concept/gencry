/**
 * /admin/settings/cron — vista CORE dei cron job pg_cron.
 *
 * Mostra:
 *   1. i job registrati come `core` in lib/cron/registry.ts
 *   2. i job presenti su pg_cron ma non riconosciuti da nessun
 *      manifest (sezione "Untracked"): permette di vederli e
 *      toggleare lo stato senza perdere visibilità.
 *
 * I job di proprietà di un modulo vengono ESCLUSI da questa vista —
 * sono gestiti nella pagina del rispettivo modulo
 * (es. /admin/modules/prices/cron).
 */
import {
  CronJobsTable,
  type CronRow,
} from "@/app/(admin)/admin/_components/cron-jobs-table";
import { listCronJobsWithLastRun, type PgCronJobWithLastRun } from "@/lib/cron/queries";
import {
  getAllRegisteredJobnames,
  getCoreJobnames,
  getCronJobMeta,
} from "@/lib/cron/registry";
import { INSTALLED_MODULES } from "@/lib/modules/registry";
import type { Metadata } from "next";
import { fetchCronRunsAction, toggleCronJobAction } from "./actions";

export const metadata: Metadata = { title: "Settings / Cron Jobs" };
export const dynamic = "force-dynamic";

export default async function SettingsCronPage() {
  let allJobs: PgCronJobWithLastRun[] = [];
  let dbError: string | null = null;
  try {
    allJobs = await listCronJobsWithLastRun();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const coreNames = getCoreJobnames();
  const registeredNames = getAllRegisteredJobnames();
  const moduleSlugs = INSTALLED_MODULES.map((m) => m.slug);

  const coreRows: CronRow[] = [];
  const untrackedRows: CronRow[] = [];

  for (const job of allJobs) {
    if (job.jobname && coreNames.has(job.jobname)) {
      coreRows.push({ job, meta: getCronJobMeta(job.jobname) ?? null });
    } else if (!job.jobname || !registeredNames.has(job.jobname)) {
      untrackedRows.push({ job, meta: null });
    }
    // i job appartenenti a un modulo li scartiamo qui
  }

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
          <p className="mt-2 text-xs" style={{ color: "var(--admin-text-muted)" }}>
            The pg_cron extension must be enabled and the connection user
            (POSTGRES_URL) must have access to the <code>cron</code> schema.
            On Supabase the default <code>postgres</code> role works.
          </p>
        </div>
      )}

      <Section
        title="Core jobs"
        subtitle="System-level cron jobs owned by the core (not by any module)."
        emptyMessage="No core cron jobs found in pg_cron. If you expect some, double-check the jobname matches lib/cron/registry.ts.">
        <CronJobsTable
          rows={coreRows}
          toggleAction={toggleCronJobAction}
          fetchRunsAction={fetchCronRunsAction}
        />
      </Section>

      <Section
        title="Untracked jobs"
        subtitle="Jobs present in pg_cron that are not registered in any manifest. Add them to lib/cron/registry.ts to give them a description.">
        <CronJobsTable
          rows={untrackedRows}
          toggleAction={toggleCronJobAction}
          fetchRunsAction={fetchCronRunsAction}
          emptyMessage="No untracked jobs. Every cron in pg_cron is mapped to the core or to a module."
        />
      </Section>

      {moduleSlugs.length > 0 && (
        <div
          className="rounded-xl p-4 text-xs"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}>
          <p className="font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
            Module-owned cron jobs
          </p>
          <p>
            Jobs that belong to an installed module are managed inside the module itself. Open the
            module page to see and toggle them:
          </p>
          <ul className="mt-2 space-y-1">
            {INSTALLED_MODULES.map((m) => (
              <li key={m.slug}>
                <code className="font-mono">{m.label}</code> →{" "}
                <a
                  href={`/admin/modules/${m.slug}/cron`}
                  className="underline"
                  style={{ color: "var(--admin-accent)" }}>
                  /admin/modules/{m.slug}/cron
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          {title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}
