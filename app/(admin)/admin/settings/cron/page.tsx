/**
 * /admin/settings/cron — vista CORE dei cron job.
 *
 * Mostra:
 *   1. Schedule QStash del core (account-gdpr, sessioni, notifiche,
 *      sicurezza), letti live dall'API QStash + config CRON_SCHEDULES.
 *   2. Job SQL diretti rimasti su pg_cron (sessions-cleanup,
 *      soft-deleted-purge): non hanno endpoint HTTP e non sono
 *      migrabili a QStash — restano su pg_cron per design.
 *
 * I job dei moduli vengono ESCLUSI da questa vista —
 * sono gestiti nella pagina del rispettivo modulo.
 */
import {
  QStashScheduleTable,
  type QStashRow,
} from "@/app/(admin)/admin/_components/qstash-schedule-table";
import { buildAdminPath, getAdminPath } from "@/lib/admin-paths";
import { CRON_SCHEDULES } from "@/lib/cron/cron-schedules";
import { getQStashSchedules } from "@/lib/cron/qstash-client";
import { listCronJobsWithLastRun } from "@/lib/cron/queries";
import { CORE_CRON_JOBS, type CronCategory } from "@/lib/cron/registry";
import { Bell, Clock, ExternalLink, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Settings / Cron Jobs" };
export const dynamic = "force-dynamic";

type CoreCategory = Exclude<CronCategory, "modules">;

const CATEGORIES: ReadonlyArray<{ key: CoreCategory; icon: LucideIcon; label: string }> = [
  { key: "account-gdpr", icon: ShieldCheck, label: "Account & GDPR" },
  { key: "sessions", icon: UserCheck, label: "Sessions" },
  { key: "notifications", icon: Bell, label: "Notifications" },
  { key: "security", icon: ShieldAlert, label: "Security" },
];

// jobname dei 2 job SQL diretti (non HTTP, restano su pg_cron)
const SQL_DIRECT_JOBS = new Set(["sessions-cleanup", "soft-deleted-purge"]);

// path-prefix dei job core (esclude quelli dei moduli)
const MODULE_PATH_PREFIXES = [
  "/api/cron/modules/prices/",
  "/api/cron/modules/posts/",
  "/api/cron/modules/news/",
  "/api/cron/modules/notifications/",
];
function isCoreSchedule(path: string) {
  return !MODULE_PATH_PREFIXES.some((p) => path.startsWith(p));
}

export default async function SettingsCronPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const t = await getTranslations("admin.settings.cron");

  // 1. QStash schedules live
  const qstashMap = await getQStashSchedules();

  // 2. Costruisce le righe QStash per i job core (con path HTTP)
  const coreQstashRows: Record<CoreCategory, QStashRow[]> = {
    "account-gdpr": [],
    sessions: [],
    notifications: [],
    security: [],
  };
  for (const def of CRON_SCHEDULES) {
    if (!isCoreSchedule(def.path)) continue;
    const meta = CORE_CRON_JOBS.find((m) => m.jobname === def.jobname);
    if (!meta || meta.category === "modules") continue;
    const cat = meta.category as CoreCategory;
    const qs = qstashMap?.get(`gencry-${def.jobname}`) ?? null;
    coreQstashRows[cat].push({
      jobname: def.jobname,
      label: meta.label,
      description: meta.description,
      purpose: meta.purpose,
      schedule: def.schedule,
      path: def.path,
      qstash: qs ? { isPaused: qs.isPaused, createdAt: qs.createdAt, liveCron: qs.cron } : null,
    });
  }

  // 3. Job SQL diretti rimasti su pg_cron
  let sqlJobs: Array<{ jobname: string; schedule: string; active: boolean }> = [];
  try {
    const all = await listCronJobsWithLastRun();
    sqlJobs = all
      .filter((j) => j.jobname && SQL_DIRECT_JOBS.has(j.jobname))
      .map((j) => ({
        jobname: j.jobname!,
        schedule: j.schedule,
        active: j.active,
      }));
  } catch {
    // pg_cron non accessibile — non blocca la pagina
  }

  const activeCategory: CoreCategory =
    (CATEGORIES.some((c) => c.key === tab) ? tab : null) as CoreCategory ??
    CATEGORIES.find((c) => coreQstashRows[c.key].length > 0)?.key ??
    "account-gdpr";

  const activeRows = coreQstashRows[activeCategory];

  const qstashServiceHref = await getAdminPath("services-qstash");

  return (
    <div className="space-y-5">
      {/* Banner QStash */}
      <QStashBanner
        configured={qstashMap !== null}
        serviceHref={qstashServiceHref}
      />

      {/* Tab categorie */}
      <div className="space-y-3">
        <div
          className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: "var(--admin-hover-bg)" }}>
          {CATEGORIES.map(({ key, icon: Icon, label }) => {
            const count = coreQstashRows[key].length;
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
                {label}
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

        <QStashScheduleTable
          rows={activeRows}
          emptyMessage="No core cron jobs in this category."
        />
      </div>

      {/* Job SQL diretti su pg_cron */}
      {sqlJobs.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              Direct SQL jobs (pg_cron)
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
              These jobs run SQL directly on the database — no HTTP endpoint,
              not migrated to QStash by design.
            </p>
          </div>
          <div
            className="rounded-xl overflow-hidden shadow-sm"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--admin-text-faint)", borderBottom: "1px solid var(--admin-input-border)" }}>
                  <th className="text-left font-medium py-3 px-4">Job</th>
                  <th className="text-left font-medium py-3 px-4">Schedule</th>
                  <th className="text-left font-medium py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {sqlJobs.map((j) => (
                  <tr
                    key={j.jobname}
                    style={{ borderTop: "1px solid var(--admin-input-border)" }}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Clock size={13} style={{ color: "var(--admin-text-faint)" }} />
                        <span className="font-mono text-xs" style={{ color: "var(--admin-text)" }}>
                          {j.jobname}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs" style={{ color: "var(--admin-text-muted)" }}>
                        {j.schedule}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-xs"
                        style={{ color: j.active ? "var(--gc-pos, #16a34a)" : "var(--admin-text-faint)" }}>
                        {j.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function QStashBanner({
  configured,
  serviceHref,
}: {
  configured: boolean;
  serviceHref: string;
}) {
  if (!configured) {
    return (
      <div
        className="rounded-xl p-4 text-sm flex items-start gap-3"
        style={{
          background: "color-mix(in srgb, #d97706 8%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, #d97706 30%, transparent)",
          color: "#d97706",
        }}>
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">QStash not configured</p>
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            Cron jobs are scheduled via Upstash QStash. Configure the token in{" "}
            <a
              href={serviceHref}
              className="underline"
              style={{ color: "var(--admin-accent)" }}>
              Services → QStash
            </a>{" "}
            to see live status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 text-xs flex items-center gap-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        color: "var(--admin-text-muted)",
      }}>
      <ShieldCheck size={14} className="shrink-0" style={{ color: "var(--gc-pos, #16a34a)" }} />
      <span>
        Cron jobs run via{" "}
        <strong style={{ color: "var(--admin-text)" }}>Upstash QStash</strong>
        {" "}— HTTP scheduler with retries and delivery logs.{" "}
        Manage schedules and view delivery logs in{" "}
        <a
          href={serviceHref}
          className="inline-flex items-center gap-0.5 underline"
          style={{ color: "var(--admin-accent)" }}>
          Services → QStash <ExternalLink size={11} />
        </a>
        {" "}or run <code>pnpm cron:sync</code> to re-sync schedules from config.
      </span>
    </div>
  );
}
