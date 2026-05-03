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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acknowledgeAlertAdmin,
  acknowledgeAlertsBulkAdmin,
} from "../actions";

const REASON_LABELS: Record<string, string> = {
  multiple_ips: "Multiple IPs",
  concurrent_devices: "Concurrent devices",
  burst_creation: "Burst creation",
  bot_user_agent: "Bot User-Agent",
  long_idle_resurrect: "Long idle resurrect",
  failed_then_success: "Failed → success login",
  sensitive_action_new_ip: "Sensitive action on new IP",
  new_subnet: "New subnet",
  ua_churn: "UA churn",
  cross_user_campaign: "Cross-user campaign",
  off_baseline_hours: "Off-baseline hours",
  admin_off_hours: "Admin off-hours",
  trusted_device_from_fresh_session: "Trusted device from fresh session",
};

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function SeverityPill({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    critical: { bg: "bg-red-100", fg: "text-red-800", label: "Critical" },
    warning: { bg: "bg-amber-100", fg: "text-amber-800", label: "Warning" },
    info: { bg: "bg-blue-100", fg: "text-blue-800", label: "Info" },
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

function userLabel(row: AdminAlertRow): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return full || row.username || row.email || "(no user)";
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
        setError(e instanceof Error ? e.message : "Acknowledge failed");
      }
    });
  }

  return (
    <tr style={{ borderTop: "1px solid var(--admin-divider)" }}>
      <td className="px-4 py-3">
        <SeverityPill severity={row.severity} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} style={{ color: "var(--admin-text-faint)" }} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {REASON_LABELS[row.reason] ?? row.reason}
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
              <p className="text-sm truncate">{userLabel(row)}</p>
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
            (no specific user)
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
            <Mail size={11} /> sent
          </span>
        ) : (
          <span
            className="text-[11px]"
            style={{ color: "var(--admin-text-faint)" }}>
            queued
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
              title="View session"
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
              Ack
            </button>
          ) : (
            <span
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-muted)",
              }}>
              <CheckCheck size={11} /> Acked
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
        setError(e instanceof Error ? e.message : "Bulk ack failed");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
          No alerts match these filters.
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
            {openIds.length} open on this page
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
              Acknowledge all on page
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span
                className="text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}>
                Acknowledge {openIds.length} alerts?
              </span>
              <button
                type="button"
                onClick={handleAckAll}
                disabled={pending}
                className="px-3 py-1 text-xs font-semibold rounded-md text-white"
                style={{ background: "var(--admin-accent)" }}>
                {pending ? "Working…" : "Confirm"}
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
                Cancel
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
              <th className="px-4 py-2.5 text-left font-medium">Severity</th>
              <th className="px-4 py-2.5 text-left font-medium">Reason · Details</th>
              <th className="px-4 py-2.5 text-left font-medium">User</th>
              <th className="px-4 py-2.5 text-left font-medium">Detected</th>
              <th className="px-4 py-2.5 text-left font-medium">Email</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
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
