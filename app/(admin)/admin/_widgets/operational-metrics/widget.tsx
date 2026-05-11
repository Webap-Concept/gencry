import { getTranslations } from "next-intl/server";
import {
  UserPlus,
  Users,
  ShieldAlert,
  BellRing,
  type LucideIcon,
} from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { getOperationalMetrics } from "@/lib/admin/dashboard/metrics";

export default async function OperationalMetricsWidget() {
  const [metrics, t] = await Promise.all([
    getOperationalMetrics(),
    getTranslations("admin.dashboard.widgets.operationalMetrics"),
  ]);

  // Tiles are intentionally laid out as a 2×2 grid: the eye reads
  // "signups → sessions / failed → alerts" naturally, and 4 large
  // numbers fit a 6×3 widget without forcing scroll.
  return (
    <WidgetCard title={t("title")} icon={Users} scrollable={false}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <StatTile
          icon={UserPlus}
          label={t("signups24h")}
          value={metrics.signups24h}
        />
        <StatTile
          icon={Users}
          label={t("activeSessions")}
          value={metrics.activeSessions}
        />
        <StatTile
          icon={ShieldAlert}
          label={t("failedLogins24h")}
          value={metrics.failedLogins24h}
          // Warn when failed-login volume crosses a noticeable threshold;
          // below that the number stays neutral so it doesn't cry wolf.
          tone={metrics.failedLogins24h >= 20 ? "warn" : "neutral"}
        />
        <StatTile
          icon={BellRing}
          label={t("pendingAlerts")}
          value={metrics.pendingAlerts}
          tone={metrics.pendingAlerts > 0 ? "warn" : "neutral"}
        />
      </div>
    </WidgetCard>
  );
}

// ── Tile ───────────────────────────────────────────────────────────────────

type Tone = "neutral" | "warn";

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: Tone;
}) {
  const valueColor =
    tone === "warn" ? "#d97706" : "var(--admin-text)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 12px",
        background:
          "color-mix(in srgb, var(--admin-page-bg) 60%, transparent)",
        border: "1px solid var(--admin-divider)",
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ color: "var(--admin-text-muted)" }}
      >
        <Icon size={12} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.1,
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}
