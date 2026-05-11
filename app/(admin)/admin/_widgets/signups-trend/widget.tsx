import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { getSignupsTrend } from "@/lib/admin/dashboard/signups-trend";
import SignupsTrendChart from "./chart";

const DAYS = 30;

export default async function SignupsTrendWidget() {
  const [{ series, totalSignups, totalUnsubs, net }, t] = await Promise.all([
    getSignupsTrend(DAYS),
    getTranslations("admin.dashboard.widgets.signupsTrend"),
  ]);

  const netPositive = net >= 0;
  const netColor = netPositive ? "#16a34a" : "#ef4444";
  const netSign = netPositive ? "+" : "−";
  const netAbs = Math.abs(net).toLocaleString();

  return (
    <WidgetCard title={t("title")} icon={TrendingUp} scrollable={false}>
      {/* Header row: signups · unsubs · net — three KPIs at a glance.
          The net is the visual emphasis (larger + colored) because
          it answers the immediate question "are we growing or losing?".
          Window label sits last as a quiet caption. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <Kpi
          icon={ArrowUp}
          iconColor="var(--admin-accent)"
          value={totalSignups}
          label={t("signupsLabel")}
        />
        <Kpi
          icon={ArrowDown}
          iconColor="#ef4444"
          value={totalUnsubs}
          label={t("unsubsLabel")}
        />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            paddingLeft: 14,
            borderLeft: "1px solid var(--admin-divider)",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
              color: netColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {netSign}
            {netAbs}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--admin-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {t("netLabel")}
          </span>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--admin-text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("windowLabel", { days: DAYS })}
        </span>
      </div>

      {/* Fixed pixel height — recharts ResponsiveContainer at 100% can
          race a flex layout chain and read back -1×-1 on first paint.
          A pixel height removes the race; the widget body still
          resizes (the bottom whitespace just grows). */}
      <div style={{ height: 180, width: "100%" }}>
        <SignupsTrendChart data={series} />
      </div>
    </WidgetCard>
  );
}

// ── KPI chip ───────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";

function Kpi({
  icon: Icon,
  iconColor,
  value,
  label,
}: {
  icon: LucideIcon;
  iconColor: string;
  value: number;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 6,
      }}
    >
      <Icon size={13} style={{ color: iconColor, alignSelf: "center" }} />
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--admin-text)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--admin-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
