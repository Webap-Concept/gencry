/**
 * /admin/modules/news/cron — schedule QStash del modulo News.
 */
import {
  QStashScheduleTable,
  type QStashRow,
} from "@/app/(admin)/admin/_components/qstash-schedule-table";
import { getAdminPath } from "@/lib/admin-paths";
import { CRON_SCHEDULES } from "@/lib/cron/cron-schedules";
import { getQStashSchedules } from "@/lib/cron/qstash-client";
import { NEWS_MODULE } from "@/lib/modules/news/manifest";
import { ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "News / Cron Jobs" };
export const dynamic = "force-dynamic";

const MODULE_PATH_PREFIX = "/api/cron/modules/news/";

export default async function NewsCronPage() {
  const qstashMap = await getQStashSchedules();
  const qstashServiceHref = await getAdminPath("services-qstash");
  const moduleJobnames = new Set(NEWS_MODULE.cronJobs.map((j) => j.jobname));

  const rows: QStashRow[] = CRON_SCHEDULES.filter(
    (def) => def.path.startsWith(MODULE_PATH_PREFIX) || moduleJobnames.has(def.jobname),
  ).map((def) => {
    const manifest = NEWS_MODULE.cronJobs.find((j) => j.jobname === def.jobname);
    const qs = qstashMap?.get(`gencry-${def.jobname}`) ?? null;
    return {
      jobname: def.jobname,
      label: manifest?.label ?? def.jobname,
      description: manifest?.description ?? "",
      purpose: manifest?.purpose ?? "",
      schedule: def.schedule,
      path: def.path,
      qstash: qs ? { isPaused: qs.isPaused, createdAt: qs.createdAt, liveCron: qs.cron } : null,
    };
  });

  return (
    <div className="space-y-5">
      <QStashBanner configured={qstashMap !== null} serviceHref={qstashServiceHref} />
      <QStashScheduleTable rows={rows} emptyMessage="No News cron jobs configured." />
    </div>
  );
}

function QStashBanner({ configured, serviceHref }: { configured: boolean; serviceHref: string }) {
  return (
    <div
      className="rounded-xl p-4 text-xs flex items-center gap-3"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)", color: "var(--admin-text-muted)" }}>
      <ShieldCheck size={14} className="shrink-0" style={{ color: configured ? "var(--gc-pos, #16a34a)" : "var(--admin-text-faint)" }} />
      <span>
        These cron jobs run via <strong style={{ color: "var(--admin-text)" }}>Upstash QStash</strong>.{" "}
        <a href={serviceHref} className="inline-flex items-center gap-0.5 underline" style={{ color: "var(--admin-accent)" }}>
          Services → QStash <ExternalLink size={11} />
        </a>
        {!configured && <span style={{ color: "#d97706" }}> — QStash token not configured.</span>}
      </span>
    </div>
  );
}
