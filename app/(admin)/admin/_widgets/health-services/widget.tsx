import { getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import {
  getHealthSnapshot,
  type HealthServiceId,
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

export default async function HealthServicesWidget() {
  const [snapshot, t] = await Promise.all([
    getHealthSnapshot(),
    getTranslations("admin.dashboard.widgets.healthServices"),
  ]);

  const byId = new Map(snapshot.services.map((s) => [s.id, s]));
  const okCount = snapshot.services.filter((s) => s.status === "ok").length;
  const downCount = snapshot.services.filter((s) => s.status === "down").length;

  return (
    <WidgetCard
      title={t("title")}
      icon={Activity}
      scrollable={false}
    >
      <div className="flex flex-col gap-2.5">
        <p
          className="text-xs"
          style={{
            margin: 0,
            color:
              downCount > 0
                ? "#ef4444"
                : "var(--admin-text-muted)",
            fontWeight: downCount > 0 ? 600 : 400,
          }}
        >
          {downCount > 0
            ? t("summaryDown", { count: downCount })
            : t("summaryOk", {
                ok: okCount,
                total: snapshot.services.length,
              })}
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
  const dotColor =
    service.status === "ok"
      ? "#16a34a"
      : service.status === "down"
        ? "#ef4444"
        : "var(--admin-text-faint)";

  const rightText =
    service.status === "ok" && service.latencyMs !== null
      ? `${service.latencyMs} ms`
      : statusLabel;

  // Tooltip surfaces the raw error code for failed probes; harmless for
  // ok/missing rows (just shows the status label).
  const titleAttr =
    service.status === "down" && service.error
      ? `${statusLabel} — ${service.error}`
      : statusLabel;

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: isLast
          ? "none"
          : "1px solid var(--admin-divider)",
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
          boxShadow:
            service.status === "ok"
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
          color:
            service.status === "ok"
              ? "var(--admin-text-muted)"
              : service.status === "down"
                ? "#ef4444"
                : "var(--admin-text-faint)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {rightText}
      </span>
    </li>
  );
}
