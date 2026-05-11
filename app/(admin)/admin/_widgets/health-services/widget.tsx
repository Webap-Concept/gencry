import { getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import {
  getHealthSnapshot,
  type HealthServiceId,
  type HealthStatus,
  type ServiceHealth,
} from "@/lib/admin/health/aggregate";

// Order is intentional: most critical (DB) first, then external auth/data
// providers, then ancillary services. Keeping it stable means admins can
// glance at the same row positions every time.
const SERVICE_ORDER: ReadonlyArray<HealthServiceId> = [
  "database",
  "supabase",
  "redis",
  "resend",
  "cloudflare",
  "sentry",
];

// Centralized color map. Slow uses the same warning amber as
// "operational metrics" alerts and the GDPR-failed tile, so the
// "something to look at but not critical" signal is visually
// consistent across the dashboard.
const STATUS_COLORS: Record<HealthStatus, string> = {
  ok: "#16a34a",
  slow: "#d97706",
  down: "#ef4444",
  missing_config: "var(--admin-text-faint)",
};

export default async function HealthServicesWidget() {
  const [snapshot, t] = await Promise.all([
    getHealthSnapshot(),
    getTranslations("admin.dashboard.widgets.healthServices"),
  ]);

  const byId = new Map(snapshot.services.map((s) => [s.id, s]));
  const okCount = snapshot.services.filter((s) => s.status === "ok").length;
  const slowCount = snapshot.services.filter((s) => s.status === "slow").length;
  const downCount = snapshot.services.filter((s) => s.status === "down").length;

  // Summary priority: down > slow > healthy. Down dominates so even a
  // single broken service surfaces first; slow is the secondary signal
  // ("everything's reachable but X feels sluggish").
  const summary =
    downCount > 0
      ? { text: t("summaryDown", { count: downCount }), color: "#ef4444", bold: true }
      : slowCount > 0
        ? { text: t("summarySlow", { count: slowCount }), color: "#d97706", bold: true }
        : {
            text: t("summaryOk", {
              ok: okCount,
              total: snapshot.services.length,
            }),
            color: "var(--admin-text-muted)",
            bold: false,
          };

  return (
    <WidgetCard title={t("title")} icon={Activity} scrollable={false}>
      <div className="flex flex-col gap-2.5">
        <p
          className="text-xs"
          style={{
            margin: 0,
            color: summary.color,
            fontWeight: summary.bold ? 600 : 400,
          }}
        >
          {summary.text}
        </p>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {SERVICE_ORDER.map((id, i) => {
            const service = byId.get(id);
            if (!service) return null;
            return (
              <ServiceRow
                key={id}
                service={service}
                label={t(`services.${id}`)}
                statusLabel={t(`status.${service.status}`)}
                isLast={i === SERVICE_ORDER.length - 1}
              />
            );
          })}
        </ul>
      </div>
    </WidgetCard>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function ServiceRow({
  service,
  label,
  statusLabel,
  isLast,
}: {
  service: ServiceHealth;
  label: string;
  statusLabel: string;
  isLast: boolean;
}) {
  const dotColor = STATUS_COLORS[service.status];

  // For reachable services (ok/slow) the right-side text is the
  // latency — admins care about the number, not the label. For
  // unreachable/unconfigured rows we show the label since latency is
  // null/meaningless.
  const reachable = service.status === "ok" || service.status === "slow";
  const rightText =
    reachable && service.latencyMs !== null
      ? `${service.latencyMs} ms`
      : statusLabel;

  // Slow rows colorize both the right text and the tooltip so the
  // anomaly stays detectable even when the user is reading the
  // latency number instead of the dot.
  const rightColor =
    service.status === "down"
      ? "#ef4444"
      : service.status === "slow"
        ? "#d97706"
        : service.status === "ok"
          ? "var(--admin-text-muted)"
          : "var(--admin-text-faint)";

  // Tooltip surfaces the raw error code for failed probes and the
  // exact latency for slow ones — both help triage faster than the
  // dot color alone.
  const titleAttr =
    service.status === "down" && service.error
      ? `${statusLabel} — ${service.error}`
      : service.status === "slow" && service.latencyMs !== null
        ? `${statusLabel} (${service.latencyMs} ms)`
        : statusLabel;

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: isLast ? "none" : "1px solid var(--admin-divider)",
      }}
      title={titleAttr}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dotColor,
          flexShrink: 0,
          // Halo on ok/slow rows for visual weight; ok is green halo,
          // slow is amber halo — both signal "this service is alive".
          boxShadow:
            service.status === "ok" || service.status === "slow"
              ? `0 0 0 3px color-mix(in srgb, ${dotColor} 20%, transparent)`
              : "none",
        }}
        aria-hidden
      />
      <span
        style={{
          fontSize: 13,
          color: "var(--admin-text)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: rightColor,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {rightText}
      </span>
    </li>
  );
}
