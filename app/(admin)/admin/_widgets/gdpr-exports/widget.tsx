import { getTranslations } from "next-intl/server";
import { sql } from "drizzle-orm";
import { FileDown, Clock, Cog, CheckCircle2, AlertOctagon } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { db } from "@/lib/db/drizzle";
import { gdprExportJobs } from "@/lib/db/schema";
import type { LucideIcon } from "lucide-react";

type StatusBucket = "pending" | "processing" | "ready" | "failed";

const BUCKETS: ReadonlyArray<{
  key: StatusBucket;
  icon: LucideIcon;
  toneWhenNonZero?: "warn";
}> = [
  { key: "pending", icon: Clock },
  { key: "processing", icon: Cog },
  { key: "ready", icon: CheckCircle2 },
  { key: "failed", icon: AlertOctagon, toneWhenNonZero: "warn" },
];

export default async function GdprExportsWidget() {
  const [groups, t] = await Promise.all([
    db
      .select({
        status: gdprExportJobs.status,
        value: sql<number>`count(*)::int`,
      })
      .from(gdprExportJobs)
      .groupBy(gdprExportJobs.status),
    getTranslations("admin.dashboard.widgets.gdprExports"),
  ]);

  const byStatus: Record<string, number> = Object.fromEntries(
    groups.map((g) => [g.status, g.value]),
  );

  return (
    <WidgetCard title={t("title")} icon={FileDown} scrollable={false}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {BUCKETS.map((b) => {
          const count = byStatus[b.key] ?? 0;
          const isWarn = b.toneWhenNonZero === "warn" && count > 0;
          return (
            <StatusTile
              key={b.key}
              icon={b.icon}
              label={t(`status.${b.key}`)}
              value={count}
              warn={isWarn}
            />
          );
        })}
      </div>
    </WidgetCard>
  );
}

// ── Tile ───────────────────────────────────────────────────────────────────

function StatusTile({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  warn: boolean;
}) {
  const valueColor = warn ? "#d97706" : "var(--admin-text)";
  const iconColor = warn ? "#d97706" : "var(--admin-text-muted)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background:
          "color-mix(in srgb, var(--admin-page-bg) 60%, transparent)",
        border: "1px solid var(--admin-divider)",
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <Icon size={14} style={{ color: iconColor, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--admin-text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: valueColor,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
