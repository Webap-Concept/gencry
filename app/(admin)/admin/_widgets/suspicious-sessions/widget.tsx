import { getTranslations } from "next-intl/server";
import { and, desc, isNull, sql } from "drizzle-orm";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { db } from "@/lib/db/drizzle";
import { sessionAlerts } from "@/lib/db/schema";

const TOP_LIMIT = 3;

export default async function SuspiciousSessionsWidget() {
  // Two queries in parallel: a COUNT(*) for the headline and the top-N
  // unacknowledged alerts for the body. Cheaper than fetching everything
  // and slicing in JS once volume grows.
  //
  // Reasons share the labels already maintained in
  // `admin.notifications.rules.*` — fetching that namespace too avoids
  // duplicating a 13-entry dictionary in the widget i18n.
  const [totalRows, recent, t, tRules] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(sessionAlerts)
      .where(isNull(sessionAlerts.acknowledgedAt)),
    db
      .select({
        id: sessionAlerts.id,
        reason: sessionAlerts.reason,
        severity: sessionAlerts.severity,
        createdAt: sessionAlerts.createdAt,
      })
      .from(sessionAlerts)
      .where(isNull(sessionAlerts.acknowledgedAt))
      .orderBy(desc(sessionAlerts.createdAt))
      .limit(TOP_LIMIT),
    getTranslations("admin.dashboard.widgets.suspiciousSessions"),
    getTranslations("admin.notifications.rules"),
  ]);

  const total = totalRows[0]?.value ?? 0;

  return (
    <WidgetCard title={t("title")} icon={ShieldAlert} scrollable={false}>
      {total === 0 ? (
        <div
          className="flex items-center gap-2.5 py-1"
          style={{ color: "var(--admin-text-muted)" }}
        >
          <ShieldCheck size={16} style={{ color: "#16a34a" }} />
          <span style={{ fontSize: 13 }}>{t("allClear")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: total >= 5 ? "#ef4444" : "var(--admin-text)",
            }}
          >
            {t("totalUnacked", { count: total })}
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
            {recent.map((alert, i) => {
              // Resolve inline so we don't have to type the next-intl
              // Translator generic in a helper signature.
              let reasonLabel = alert.reason;
              try {
                reasonLabel = tRules(
                  `${alert.reason}.label` as Parameters<typeof tRules>[0],
                );
              } catch {
                /* unknown reason — fall back to the raw key */
              }
              return (
                <AlertRow
                  key={alert.id}
                  reason={alert.reason}
                  reasonLabel={reasonLabel}
                  severity={alert.severity}
                  isLast={i === recent.length - 1}
                />
              );
            })}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function AlertRow({
  reason,
  reasonLabel,
  severity,
  isLast,
}: {
  reason: string;
  reasonLabel: string;
  severity: string;
  isLast: boolean;
}) {
  const sevColor =
    severity === "critical"
      ? "#ef4444"
      : severity === "warning"
        ? "#d97706"
        : "var(--admin-text-faint)";

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
        borderBottom: isLast ? "none" : "1px solid var(--admin-divider)",
      }}
      title={`${reason} — ${severity}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: sevColor,
          flexShrink: 0,
        }}
        aria-hidden
      />
      <span
        style={{
          fontSize: 12,
          color: "var(--admin-text)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {reasonLabel}
      </span>
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: sevColor,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {severity}
      </span>
    </li>
  );
}

