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
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { buildAdminPath } from "@/lib/admin-paths";
import {
  buildExpectedCommandBody,
  buildScheduleStatement,
  commandsMatch,
} from "@/lib/cron/expected-command";
import { listCronJobsWithLastRun, type PgCronJobWithLastRun } from "@/lib/cron/queries";
import {
  CORE_CRON_JOBS,
  getAllRegisteredJobnames,
  getCoreJobnames,
  getCronJobMeta,
} from "@/lib/cron/registry";
import { INSTALLED_MODULES } from "@/lib/modules/registry";
import { getSiteUrl } from "@/lib/seo";
import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchCronRunsAction, toggleCronJobAction } from "./actions";

export const metadata: Metadata = { title: "Settings / Cron Jobs" };
export const dynamic = "force-dynamic";

export default async function SettingsCronPage() {
  const [t, tHeader] = await Promise.all([
    getTranslations("admin.settings.cron"),
    getTranslations("admin.settings"),
  ]);
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
  const siteUrl = await getSiteUrl();
  // Path admin runtime per ogni modulo: /<adminSlug>/modules/<slug>/cron
  const moduleCronPaths = await Promise.all(
    INSTALLED_MODULES.map(async (m) => ({
      slug: m.slug,
      label: m.label,
      href: await buildAdminPath(`/modules/${m.slug}/cron`),
    })),
  );

  const coreRows: CronRow[] = [];
  const untrackedRows: CronRow[] = [];

  for (const job of allJobs) {
    if (job.jobname && coreNames.has(job.jobname)) {
      const meta = getCronJobMeta(job.jobname) ?? null;
      coreRows.push(buildRow(job, meta, siteUrl));
    } else if (!job.jobname || !registeredNames.has(job.jobname)) {
      untrackedRows.push({ job, meta: null });
    }
    // i job appartenenti a un modulo li scartiamo qui
  }

  // Core HTTP-based jobs that are NOT yet registered in pg_cron — render a
  // ready-to-paste schedule statement so the admin can install them with
  // the current site domain baked in.
  const presentJobnames = new Set(allJobs.map((j) => j.jobname).filter(Boolean) as string[]);
  const missingCore = CORE_CRON_JOBS.filter(
    (c) => c.path && c.schedule && !presentJobnames.has(c.jobname),
  ).map((c) => ({
    jobname: c.jobname,
    label: c.label,
    schedule: c.schedule!,
    path: c.path!,
    statement: siteUrl
      ? buildScheduleStatement({
          jobname: c.jobname,
          schedule: c.schedule!,
          path: c.path!,
          baseUrl: siteUrl,
        })
      : null,
  }));

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Clock}
        breadcrumbLabel={tHeader("rootTitle")}
        title={tHeader("sections.cron.label")}
        subtitle={tHeader("sections.cron.description")}
      />
      {dbError && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: "color-mix(in srgb, var(--gc-neg, #dc2626) 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
            color: "var(--gc-neg, #dc2626)",
          }}>
          <p className="font-semibold mb-1">{t("dbErrorTitle")}</p>
          <p className="font-mono text-xs">{dbError}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--admin-text-muted)" }}>
            {t("dbErrorHintBefore")} <code>{t("dbErrorHintCron")}</code>{" "}
            {t("dbErrorHintAfter")} <code>{t("dbErrorHintRole")}</code>{" "}
            {t("dbErrorHintTail")}
          </p>
        </div>
      )}

      {missingCore.length > 0 && (
        <div
          className="rounded-xl p-4 text-xs space-y-3"
          style={{
            background: "color-mix(in srgb, #d97706 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #d97706 30%, transparent)",
            color: "#d97706",
          }}>
          <p className="font-semibold">{t("missingJobsTitle")}</p>
          <p>{t("missingJobsIntro")}</p>
          {!siteUrl && <p className="font-semibold">{t("missingJobsNoDomain")}</p>}
          {siteUrl && (
            <>
              <ul className="space-y-3">
                {missingCore.map((c) => (
                  <li key={c.jobname}>
                    <p className="font-mono">
                      {c.jobname} <span style={{ color: "var(--admin-text-faint)" }}>· {c.schedule} · {c.path}</span>
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
              <p style={{ color: "var(--admin-text-faint)" }}>{t("missingJobsSecretReminder")}</p>
            </>
          )}
        </div>
      )}

      <Section title={t("coreJobsTitle")} subtitle={t("coreJobsSubtitle")}>
        <CronJobsTable
          rows={coreRows}
          toggleAction={toggleCronJobAction}
          fetchRunsAction={fetchCronRunsAction}
          emptyMessage={t("coreJobsEmpty")}
        />
      </Section>

      <Section title={t("untrackedJobsTitle")} subtitle={t("untrackedJobsSubtitle")}>
        <CronJobsTable
          rows={untrackedRows}
          toggleAction={toggleCronJobAction}
          fetchRunsAction={fetchCronRunsAction}
          emptyMessage={t("untrackedJobsEmpty")}
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
            {t("moduleJobsTitle")}
          </p>
          <p>{t("moduleJobsHint")}</p>
          <ul className="mt-2 space-y-1">
            {moduleCronPaths.map((m) => (
              <li key={m.slug}>
                <code className="font-mono">{m.label}</code> →{" "}
                <a
                  href={m.href}
                  className="underline"
                  style={{ color: "var(--admin-accent)" }}>
                  {m.href}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Costruisce il `CronRow` con expected command + drift detection. Se il
 *  meta non ha `path` (job SQL puro come sessions-cleanup) o se il dominio
 *  non è configurato, omette expected/drift e la UI ricade sul rendering
 *  base. */
function buildRow(
  job: PgCronJobWithLastRun,
  meta: import("@/lib/cron/registry").CronJobMeta | null,
  baseUrl: string,
): CronRow {
  if (!meta?.path || !baseUrl) return { job, meta };
  const expectedBody = buildExpectedCommandBody({
    path: meta.path,
    baseUrl,
  });
  const expectedCommand = meta.schedule
    ? buildScheduleStatement({
        jobname: meta.jobname,
        schedule: meta.schedule,
        path: meta.path,
        baseUrl,
      })
    : expectedBody;
  return {
    job,
    meta,
    expectedCommand,
    commandDrift: !commandsMatch(job.command, expectedBody),
  };
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
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
