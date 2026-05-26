// app/(admin)/admin/modules/notifications/page.tsx
//
// Overview admin del modulo Notifications. NIENTE header inline / no
// quicklink box: il topbar del Pannello Admin gestisce icona + titolo
// (vedi SECTION_MAP in lib/admin/current-section.ts) e le tab del layout
// gestiscono la navigation cross-section. Qui solo i health probes
// della pipeline outbox→fanout + status modulo.
import type { Metadata } from "next";
import { Activity, CheckCircle2, Clock, Inbox } from "lucide-react";
import { NOTIFICATIONS_MODULE } from "@/lib/modules/notifications/manifest";
import { getNotificationsHealth } from "@/lib/modules/notifications/queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { resolveCapacityCurrentTier } from "@/lib/capacity/resolve";

export const metadata: Metadata = { title: "Notifications / Overview" };
export const dynamic = "force-dynamic";

export default async function NotificationsAdminOverviewPage() {
  const [settings, health] = await Promise.all([
    getAppSettings(),
    getNotificationsHealth(),
  ]);

  const profiles = NOTIFICATIONS_MODULE.capacityProfiles ?? [];
  const tierByScope = profiles.map((p) => ({
    scope: p.scope,
    tier: resolveCapacityCurrentTier(p, settings as Record<string, string>),
  }));
  const tiers = tierByScope.map((t) => t.tier);
  const uniqueTiers = Array.from(new Set(tiers));
  const tierBadge = uniqueTiers.length === 1 ? uniqueTiers[0] : profiles.length === 0 ? "alpha" : "mixed";

  const outboxStale = health.outboxBacklog > 50;

  return (
    <div className="space-y-5">
      {/* ─── Module status ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5">
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-[var(--admin-text)]">
            Stato del modulo
          </h2>
          <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
            Notifiche end-user generate dagli eventi social. Fanout
            zero-latency via trigger DB su <code>posts_outbox</code>.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KV label="Versione manifest" value={`v${NOTIFICATIONS_MODULE.version}`} />
          <KV
            label="Tier capacity"
            value={
              tierBadge === "mixed" ? (
                <span title={tierByScope.map((t) => `${t.scope}: ${t.tier}`).join(" · ")}>
                  mixed ({uniqueTiers.join(" · ")})
                </span>
              ) : (
                tierBadge
              )
            }
            tone={tierBadge === "mixed" ? "warn" : "ok"}
          />
          <KV
            label="Outbox backlog"
            value={
              health.outboxBacklog === 0
                ? "vuoto"
                : `${health.outboxBacklog}${outboxStale ? " · grande" : ""}`
            }
            tone={outboxStale ? "warn" : health.outboxBacklog > 0 ? undefined : "ok"}
          />
        </div>
      </section>

      {/* ─── Health probes ──────────────────────────────────────────────── */}
      <section>
        <header className="mb-2">
          <h2 className="text-sm font-semibold text-[var(--admin-text)] uppercase tracking-wider">
            Health
          </h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HealthCard
            icon={Inbox}
            label="Outbox da processare"
            value={health.outboxBacklog}
            tone={health.outboxBacklog === 0 ? "ok" : outboxStale ? "warn" : "info"}
          />
          <HealthCard
            icon={Activity}
            label="Notifiche ultime 24h"
            value={health.totalToday}
            tone="info"
          />
          <HealthCard
            icon={Clock}
            label="Non lette totali"
            value={health.totalUnread}
            tone="info"
          />
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function KV({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--admin-text-faint)]">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold ${
          tone === "warn"
            ? "text-[var(--admin-destructive)]"
            : tone === "ok"
              ? "text-[var(--admin-accent)]"
              : "text-[var(--admin-text)]"
        }`}
      >
        {value}
      </div>
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
  const toneClass =
    tone === "ok"
      ? "text-[var(--admin-accent)]"
      : tone === "warn"
        ? "text-[var(--admin-destructive)]"
        : "text-[var(--admin-text-muted)]";
  return (
    <div className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${toneClass}`}>
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-[var(--admin-text-faint)]">
            {label}
          </div>
          <div className="mt-0.5 text-xl font-semibold text-[var(--admin-text)] tabular-nums">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
