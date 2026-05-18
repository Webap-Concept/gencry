// app/(admin)/admin/modules/notifications/page.tsx
//
// Overview admin del modulo Notifications. NIENTE metriche product
// (le notifiche per user vanno nella page utente /notifiche). Qui solo
// health probes della pipeline outbox→fanout + quick links.
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Activity,
  BookOpen,
  Bell,
  CheckCircle2,
  Clock,
  Inbox,
  Settings,
} from "lucide-react";
import { NOTIFICATIONS_MODULE } from "@/lib/modules/notifications/manifest";
import { getNotificationsHealth } from "@/lib/modules/notifications/queries";
import { getAdminUrlSlug } from "@/lib/admin-paths";

export const metadata: Metadata = { title: "Notifications / Overview" };
export const dynamic = "force-dynamic";

export default async function NotificationsAdminOverviewPage() {
  const [adminSlug, health, t] = await Promise.all([
    getAdminUrlSlug(),
    getNotificationsHealth(),
    getTranslations("modules.notifications.admin.overview"),
  ]);
  const base = `/${adminSlug}/modules/notifications`;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-accent)]/10 text-[var(--admin-accent)]">
          <Bell size={20} aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--admin-fg)]">
            {t("title")}
          </h1>
          <p className="text-[12.5px] text-[var(--admin-fg-3)] mt-0.5 max-w-2xl">
            {t("description")}
          </p>
          <p className="text-[11px] text-[var(--admin-fg-3)] mt-1">
            v{NOTIFICATIONS_MODULE.version}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HealthCard
          icon={Inbox}
          label={t("health_outbox_backlog")}
          value={health.outboxBacklog}
          tone={health.outboxBacklog === 0 ? "ok" : "warn"}
        />
        <HealthCard
          icon={Activity}
          label={t("health_total_today")}
          value={health.totalToday}
          tone="info"
        />
        <HealthCard
          icon={Clock}
          label={t("health_total_unread")}
          value={health.totalUnread}
          tone="info"
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickLink
          href={`${base}/settings`}
          icon={Settings}
          label={t("shortcuts_settings")}
        />
        <QuickLink
          href={`${base}/architecture`}
          icon={BookOpen}
          label={t("shortcuts_architecture")}
        />
      </section>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "ok" | "warn" | "info";
}) {
  const toneCls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-slate-500/10 text-slate-600";
  return (
    <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg-2)] p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneCls}`}
        >
          <Icon size={18} aria-hidden />
        </span>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--admin-fg-3)]">
            {label}
          </div>
          <div className="text-xl font-semibold text-[var(--admin-fg)] tabular-nums">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Settings;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg-2)] p-4 hover:bg-[var(--admin-bg-3)]/40 transition-colors"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600">
        <Icon size={18} aria-hidden />
      </span>
      <span className="text-sm font-medium text-[var(--admin-fg)]">{label}</span>
    </Link>
  );
}
