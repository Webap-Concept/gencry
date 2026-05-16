/**
 * /admin/settings/cron — vista CORE dei cron job pg_cron.
 *
 * Mostra:
 *   1. i job registrati come `core` in lib/cron/registry.ts, raggruppati
 *      per categoria funzionale in tab (Account & GDPR, Sessioni, Notifiche,
 *      Sicurezza).
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
import { buildAdminPath } from "@/lib/admin-paths";
import {
  buildExpectedCommandBody,
  buildScheduleStatement,
  commandsMatch,
} from "@/lib/cron/expected-command";
import { listCronJobsWithLastRun, type PgCronJobWithLastRun } from "@/lib/cron/queries";
import {
  CORE_CRON_JOBS,
  type CronCategory,
  getAllRegisteredJobnames,
  getCoreJobnames,
  getCronJobMeta,
} from "@/lib/cron/registry";
import { INSTALLED_MODULES } from "@/lib/modules/registry";
import { getSiteUrl } from "@/lib/seo";
import { Bell, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchCronRunsAction, toggleCronJobAction } from "./actions";

export const metadata: Metadata = { title: "Settings / Cron Jobs" };
export const dynamic = "force-dynamic";

type CoreCategory = Exclude<CronCategory, "modules">;

const CATEGORIES: ReadonlyArray<{ key: CoreCategory; icon: LucideIcon }> = [
  { key: "account-gdpr", icon: ShieldCheck },
  { key: "sessions", icon: UserCheck },
  { key: "notifications", icon: Bell },
  { key: "security", icon: ShieldAlert },
] as const;

function isCoreCategory(s: string | null | undefined): s is CoreCategory {
  return !!s && CATEGORIES.some((c) => c.key === s);
}

export default async function SettingsCronPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getTranslations("admin.settings.cron");
  const { tab } = await searchParams;

  let allJobs: PgCronJobWithLastRun[] = [];
  let dbError: string | null = null;
  try {
    allJobs = await listCronJobsWithLastRun();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }

  const coreNames = getCoreJobnames();
  const registeredNames = getAllRegisteredJobnames();
  const modulesWithCron = INSTALLED_MODULES.filter((m) => m.cronJobs.length > 0);
  const siteUrl = await getSiteUrl();
  const moduleCronPaths = await Promise.all(
    modulesWithCron.map(async (m) => ({
      slug: m.slug,
      label: m.label,
      href: await buildAdminPath(`/modules/${m.slug}/cron`),
    })),
  );

  const coreRowsByCategory = new Map<CoreCategory, CronRow[]>();
  const untrackedRows: CronRow[] = [];

  for (const job of allJobs) {
    if (job.jobname && coreNames.has(job.jobname)) {
      const meta = getCronJobMeta(job.jobname);
      if (!meta || meta.category === "modules") continue;
      const row = buildRow(job, meta, siteUrl);
      const list = coreRowsByCategory.get(meta.category) ?? [];
      list.push(row);
      coreRowsByCategory.set(meta.category, list);
    } else if (!job.jobname || !registeredNames.has(job.jobname)) {
      untrackedRows.push({ job, meta: null });
    }
  }

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

  // Conta job per categoria (sia in pg_cron sia missing) → per badge tab
  const categoryCounts = new Map<CoreCategory, number>();
  for (const c of CORE_CRON_JOBS) {
    if (c.category === "modules") continue;
    const cat = c.category as CoreCategory;
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const activeCategory: CoreCategory = isCoreCategory(tab)
    ? tab
    : CATEGORIES.find((c) => (categoryCounts.get(c.key) ?? 0) > 0)?.key ?? "account-gdpr";

  const activeRows = coreRowsByCategory.get(activeCategory) ?? [];

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

      <div className="space-y-3">
        <div
          className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: "var(--admin-hover-bg)" }}>
          {CATEGORIES.map(({ key, icon: Icon }) => {
            const count = categoryCounts.get(key) ?? 0;
            if (count === 0) return null;
            const isActive = key === activeCategory;
            return (
              <a
                key={key}
                href={`?tab=${key}`}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
                style={{
                  background: isActive ? "var(--admin-accent)" : "transparent",
                  color: isActive ? "#fff" : "var(--admin-text-muted)",
                  boxShadow: isActive ? "0 1px 3px oklch(0 0 0 / 0.15)" : "none",
                }}>
                <Icon size={13} />
                {t(`categories.${key}.label`)}
                <span
                  className="text-[11px] font-semibold px-1.5 rounded"
                  style={{
                    background: isActive ? "oklch(1 0 0 / 0.18)" : "var(--admin-card-bg)",
                    color: isActive ? "#fff" : "var(--admin-text-faint)",
                  }}>
                  {count}
                </span>
              </a>
            );
          })}
        </div>

        <Section
          title={t(`categories.${activeCategory}.label`)}
          subtitle={t(`categories.${activeCategory}.subtitle`)}>
          <CronJobsTable
            rows={activeRows}
            toggleAction={toggleCronJobAction}
            fetchRunsAction={fetchCronRunsAction}
            emptyMessage={t("coreJobsEmpty")}
          />
        </Section>
      </div>

      <Section title={t("untrackedJobsTitle")} subtitle={t("untrackedJobsSubtitle")}>
        <CronJobsTable
          rows={untrackedRows}
          toggleAction={toggleCronJobAction}
          fetchRunsAction={fetchCronRunsAction}
          emptyMessage={t("untrackedJobsEmpty")}
        />
      </Section>

      {moduleCronPaths.length > 0 && (
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
