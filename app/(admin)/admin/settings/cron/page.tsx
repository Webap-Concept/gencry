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
import { listCronJobsWithLastRun, type PgCronJobWithLastRun } from "@/lib/cron/queries";
import {
  getAllRegisteredJobnames,
  getCoreJobnames,
  getCronJobMeta,
} from "@/lib/cron/registry";
import { INSTALLED_MODULES } from "@/lib/modules/registry";
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
      coreRows.push({ job, meta: getCronJobMeta(job.jobname) ?? null });
    } else if (!job.jobname || !registeredNames.has(job.jobname)) {
      untrackedRows.push({ job, meta: null });
    }
    // i job appartenenti a un modulo li scartiamo qui
  }

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
