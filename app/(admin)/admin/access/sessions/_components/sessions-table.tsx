"use client";

import { parseUserAgent } from "@/lib/account/parse-user-agent";
import type { AdminSessionRow } from "@/lib/db/admin-sessions-queries";
import {
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Loader2,
  Monitor,
  ShieldOff,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  revokeAllSessionsForUserAdmin,
  revokeUserSessionAdmin,
} from "../actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function StatusBadge({ status }: { status: AdminSessionRow["status"] }) {
  const map = {
    active: { label: "Active", bg: "bg-emerald-100", fg: "text-emerald-700" },
    revoked: { label: "Revoked", bg: "bg-red-100", fg: "text-red-700" },
    expired: { label: "Expired", bg: "bg-gray-200", fg: "text-gray-600" },
  } as const;
  const cfg = map[status];
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.fg}`}>
      {cfg.label}
    </span>
  );
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const parsed = parseUserAgent(ua);
  const Icon =
    parsed.deviceType === "mobile"
      ? Smartphone
      : parsed.deviceType === "tablet"
        ? Tablet
        : parsed.deviceType === "desktop"
          ? Monitor
          : HelpCircle;
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: "var(--admin-hover-bg)" }}>
      <Icon size={14} style={{ color: "var(--admin-text-faint)" }} />
    </div>
  );
}

/** Builds an English label from the parser output (which is IT). */
function deviceLabel(ua: string | null): string {
  const parsed = parseUserAgent(ua);
  if (parsed.deviceType === "unknown") return "Unknown device";
  // The parser ships "Browser sconosciuto" / "Sistema sconosciuto" as
  // fallback fields; surface them as "Unknown" in the admin UI.
  const browser = parsed.browser.startsWith("Browser ") ? "Unknown" : parsed.browser;
  const os = parsed.os.startsWith("Sistema ") ? "Unknown OS" : parsed.os;
  return `${browser} on ${os}`;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return dateFmt.format(date);
}

function userInitials(row: AdminSessionRow): string {
  const fromName = [row.firstName, row.lastName]
    .filter(Boolean)
    .map((n) => n![0]?.toUpperCase())
    .join("");
  return fromName || row.email[0].toUpperCase();
}

function userDisplayName(row: AdminSessionRow): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return full || row.username || row.email;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function SessionRow({ row }: { row: AdminSessionRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  function handleRevoke() {
    if (!window.confirm("Revoke this session? The device will be signed out.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await revokeUserSessionAdmin(row.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revoke failed");
      }
    });
  }

  function handleRevokeAll() {
    setError(null);
    startTransition(async () => {
      try {
        const { revokedCount } = await revokeAllSessionsForUserAdmin(row.userId);
        if (revokedCount === 0) {
          setError("No active sessions to revoke for this user.");
        } else {
          router.refresh();
        }
        setConfirmAll(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revoke failed");
      }
    });
  }

  const canRevoke = row.status === "active";

  return (
    <tr style={{ borderTop: "1px solid var(--admin-divider)" }}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {row.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.avatarUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white"
              style={{ background: "var(--admin-accent)" }}>
              {userInitials(row)}
            </div>
          )}
          <div className="min-w-0">
            <Link
              href={`/admin/access/users/${row.userId}`}
              className="block text-sm font-medium truncate transition-colors hover:underline"
              style={{ color: "var(--admin-text)" }}>
              {userDisplayName(row)}
            </Link>
            <p
              className="text-[11px] truncate"
              style={{ color: "var(--admin-text-faint)" }}>
              {row.email}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <DeviceIcon ua={row.userAgent} />
          <div className="min-w-0">
            <p
              className="text-sm truncate"
              style={{ color: "var(--admin-text)" }}>
              {deviceLabel(row.userAgent)}
            </p>
            <p
              className="text-[11px] font-mono truncate"
              style={{ color: "var(--admin-text-faint)" }}>
              {row.ip ?? "—"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-sm" style={{ color: "var(--admin-text-muted)" }}>
        <div title={dateTimeFmt.format(row.lastSeenAt)}>
          {relativeTime(row.lastSeenAt)}
        </div>
        <div className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          opened {dateFmt.format(row.createdAt)}
        </div>
      </td>

      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/access/users/${row.userId}`}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--admin-hover-bg)]"
            title="View user"
            style={{ color: "var(--admin-text-muted)" }}>
            <ExternalLink size={14} />
          </Link>

          <button
            type="button"
            onClick={handleRevoke}
            disabled={!canRevoke || pending}
            className="p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-red-50"
            title={canRevoke ? "Revoke this session" : "Already inactive"}
            style={{ color: canRevoke ? "#dc2626" : "var(--admin-text-faint)" }}>
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
          </button>

          {!confirmAll ? (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              disabled={pending}
              className="p-1.5 rounded-md transition-colors hover:bg-red-50 disabled:opacity-40"
              title="Revoke ALL sessions of this user"
              style={{ color: "#b91c1c" }}>
              <ShieldOff size={14} />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 ml-1">
              <span
                className="text-[11px]"
                style={{ color: "var(--admin-text-muted)" }}>
                Revoke all?
              </span>
              <button
                type="button"
                onClick={handleRevokeAll}
                disabled={pending}
                className="px-2 py-0.5 text-[11px] font-semibold rounded-md text-white"
                style={{ background: "#dc2626" }}>
                {pending ? "…" : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                disabled={pending}
                className="px-2 py-0.5 text-[11px] font-semibold rounded-md"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                }}>
                No
              </button>
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

export function SessionsTable({ items }: { items: AdminSessionRow[] }) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
          No sessions match these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-[11px] uppercase tracking-wider"
            style={{ color: "var(--admin-text-faint)" }}>
            <th className="px-4 py-2.5 text-left font-medium">User</th>
            <th className="px-4 py-2.5 text-left font-medium">Device · IP</th>
            <th className="px-4 py-2.5 text-left font-medium">Last seen</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <SessionRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
