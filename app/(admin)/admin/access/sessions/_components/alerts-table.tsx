"use client";

import type { AdminAlertRow } from "@/lib/db/admin-sessions-queries";
import {
  AlertCircle,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  Mail,
  ShieldAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acknowledgeAlertAdmin,
  acknowledgeAlertsBulkAdmin,
} from "../actions";

type AlertsT = ReturnType<
  typeof useTranslations<"admin.access.sessions.alertsTable">
>;

const REASON_KEYS: Record<string, string> = {
  multiple_ips: "reasonMultipleIps",
  concurrent_devices: "reasonConcurrentDevices",
  burst_creation: "reasonBurstCreation",
  bot_user_agent: "reasonBotUserAgent",
  long_idle_resurrect: "reasonLongIdleResurrect",
  failed_then_success: "reasonFailedThenSuccess",
  sensitive_action_new_ip: "reasonSensitiveActionNewIp",
  new_subnet: "reasonNewSubnet",
  ua_churn: "reasonUaChurn",
  cross_user_campaign: "reasonCrossUserCampaign",
  off_baseline_hours: "reasonOffBaselineHours",
  admin_off_hours: "reasonAdminOffHours",
  trusted_device_from_fresh_session: "reasonTrustedDeviceFromFreshSession",
};

function makeRelativeTime(t: AlertsT) {
  return (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return t("relativeJustNow");
    if (diffMin < 60) return t("relativeMinutes", { m: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t("relativeHours", { h: diffH });
    const diffD = Math.floor(diffH / 24);
    return t("relativeDays", { d: diffD });
  };
}

function SeverityPill({ severity, t }: { severity: string; t: AlertsT }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    critical: {
      bg: "bg-red-100",
      fg: "text-red-800",
      label: t("severityCritical"),
    },
    warning: {
      bg: "bg-amber-100",
      fg: "text-amber-800",
      label: t("severityWarning"),
    },
    info: { bg: "bg-blue-100", fg: "text-blue-800", label: t("severityInfo") },
  };
  const c = map[severity] ?? {
    bg: "bg-gray-100",
    fg: "text-gray-700",
    label: severity,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${c.bg} ${c.fg}`}>
      {c.label}
    </span>
  );
}

function userInitials(row: AdminAlertRow): string {
  const fromName = [row.firstName, row.lastName]
    .filter(Boolean)
    .map((n) => n![0]?.toUpperCase())
    .join("");
  return fromName || row.email?.[0]?.toUpperCase() || "?";
}

function userLabel(row: AdminAlertRow, fallback: string): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return full || row.username || row.email || fallback;
}

function detailsSummary(details: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      const sample = v.slice(0, 3).join(", ");
      out.push(
        `${k}: ${sample}${v.length > 3 ? `, +${v.length - 3} more` : ""}`,
      );
    } else if (typeof v === "object") {
      out.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      out.push(`${k}: ${String(v)}`);
    }
  }
  return out.join(" · ") || "—";
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function AlertRow({
  row,
  onChanged,
}: {
  row: AdminAlertRow;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.access.sessions.alertsTable");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  const dateTimeFmt = new Intl.DateTimeFormat(dateLocale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const relativeTime = makeRelativeTime(t);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAck = row.acknowledgedAt !== null;

  function handleAck() {
    setError(null);
    startTransition(async () => {
      try {
        await acknowledgeAlertAdmin(row.id);
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("ackFailed"));
      }
    });
  }

  const reasonKey = REASON_KEYS[row.reason];
  const reasonLabel = reasonKey
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t as any)(reasonKey)
    : row.reason;

  return (
    <tr style={{ borderTop: "1px solid var(--admin-divider)" }}>
      <td className="px-4 py-3">
        <SeverityPill severity={row.severity} t={t} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} style={{ color: "var(--admin-text-faint)" }} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {reasonLabel}
          </span>
        </div>
        <p
          className="text-[12px] mt-1 truncate max-w-xl"
          style={{ color: "var(--admin-text-muted)" }}
          title={detailsSummary(row.details)}>
          {detailsSummary(row.details)}
        </p>
      </td>

      <td className="px-4 py-3">
        {row.userId ? (
          <Link
            href={`/admin/access/users/${row.userId}`}
            className="flex items-center gap-2 min-w-0 hover:underline"
            style={{ color: "var(--admin-text)" }}>
            {row.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: "var(--admin-accent)" }}>
                {userInitials(row)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm truncate">{userLabel(row, t("noUser"))}</p>
              <p
                className="text-[11px] truncate"
                style={{ color: "var(--admin-text-faint)" }}>
                {row.email ?? row.userId}
              </p>
            </div>
          </Link>
        ) : (
          <span
            className="text-sm italic"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("noUser")}
          </span>
        )}
      </td>

      <td className="px-4 py-3" style={{ color: "var(--admin-text-muted)" }}>
        <p className="text-sm" title={dateTimeFmt.format(row.createdAt)}>
          {relativeTime(row.createdAt)}
        </p>
        <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          {dateTimeFmt.format(row.createdAt)}
        </p>
      </td>

      <td className="px-4 py-3">
        {row.emailSentAt ? (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--admin-text-faint)" }}>
            <Mail size={11} /> {t("emailSent")}
          </span>
        ) : (
          <span
            className="text-[11px]"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("emailQueued")}
          </span>
        )}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          {row.sessionId && (
            <Link
              href={
                row.userId
                  ? `/admin/access/users/${row.userId}`
                  : "/admin/access/sessions"
              }
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--admin-hover-bg)]"
              title={t("actionViewSession")}
              style={{ color: "var(--admin-text-muted)" }}>
              <ExternalLink size={14} />
            </Link>
          )}

          {!isAck ? (
            <button
              type="button"
              onClick={handleAck}
              disabled={pending}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md text-white inline-flex items-center gap-1 disabled:opacity-50"
              style={{ background: "var(--admin-accent)" }}>
              {pending ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Check size={11} />
              )}
              {t("actionAck")}
            </button>
          ) : (
            <span
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-muted)",
              }}>
              <CheckCheck size={11} /> {t("actionAcked")}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-600">
            <AlertCircle size={11} />
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function AlertsTable({ items }: { items: AdminAlertRow[] }) {
  const t = useTranslations("admin.access.sessions.alertsTable");
  const tParent = useTranslations("admin.access.sessions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const openIds = items
    .filter((a) => a.acknowledgedAt === null)
    .map((a) => a.id);

  function handleAckAll() {
    if (openIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await acknowledgeAlertsBulkAdmin(openIds);
        setConfirmAll(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("bulkAckFailed"));
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
          {tParent("emptyAlerts")}
        </p>
      </div>
    );
  }

  return (
    <>
      {openIds.length > 0 && (
        <div
          className="flex items-center justify-between flex-wrap gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--admin-divider)" }}>
          <span
            className="text-[12px]"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("bulkOpenLabel", { count: openIds.length })}
          </span>
          {!confirmAll ? (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              disabled={pending}
              className="px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <CheckCheck size={13} />
              {t("bulkAckButton")}
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span
                className="text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("bulkAckPrompt", { count: openIds.length })}
              </span>
              <button
                type="button"
                onClick={handleAckAll}
                disabled={pending}
                className="px-3 py-1 text-xs font-semibold rounded-md text-white"
                style={{ background: "var(--admin-accent)" }}>
                {pending ? t("bulkWorking") : t("bulkConfirm")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                disabled={pending}
                className="px-3 py-1 text-xs font-semibold rounded-md"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                }}>
                {t("bulkCancel")}
              </button>
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="px-4 py-2 text-[12px] text-red-600">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--admin-text-faint)" }}>
              <th className="px-4 py-2.5 text-left font-medium">
                {t("headerSeverity")}
              </th>
              <th className="px-4 py-2.5 text-left font-medium">
                {t("headerReason")}
              </th>
              <th className="px-4 py-2.5 text-left font-medium">
                {t("headerUser")}
              </th>
              <th className="px-4 py-2.5 text-left font-medium">
                {t("headerDetected")}
              </th>
              <th className="px-4 py-2.5 text-left font-medium">
                {t("headerEmail")}
              </th>
              <th className="px-4 py-2.5 text-right font-medium">
                {t("headerActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <AlertRow
                key={row.id}
                row={row}
                onChanged={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
