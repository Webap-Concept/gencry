"use client";

import { parseUserAgent } from "@/lib/account/parse-user-agent";
import {
  AlertCircle,
  HelpCircle,
  Loader2,
  Monitor,
  ShieldOff,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import {
  revokeAllSessionsForUserAdmin,
  revokeUserSessionAdmin,
} from "../../../sessions/actions";

type SessionVM = {
  id: string;
  userId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  status: "active" | "revoked" | "expired";
};

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

function deviceLabel(ua: string | null): string {
  const parsed = parseUserAgent(ua);
  if (parsed.deviceType === "unknown") return "Unknown device";
  const browser = parsed.browser.startsWith("Browser ") ? "Unknown" : parsed.browser;
  const os = parsed.os.startsWith("Sistema ") ? "Unknown OS" : parsed.os;
  return `${browser} on ${os}`;
}

function deviceIcon(ua: string | null) {
  const t = parseUserAgent(ua).deviceType;
  if (t === "mobile") return Smartphone;
  if (t === "tablet") return Tablet;
  if (t === "desktop") return Monitor;
  return HelpCircle;
}

function StatusBadge({ status }: { status: SessionVM["status"] }) {
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

function SessionRow({
  s,
  onChanged,
}: {
  s: SessionVM;
  onChanged: () => void;
}) {
  // Plain useState (not useTransition) so the button spinner clears when the
  // action returns; we don't want a slow router.refresh() to pin it open.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  const Icon = deviceIcon(s.userAgent);
  const canRevoke = s.status === "active";

  async function doRevoke() {
    setError(null);
    setPending(true);
    try {
      await revokeUserSessionAdmin(s.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className="rounded-xl p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--admin-hover-bg)" }}>
          <Icon size={15} style={{ color: "var(--admin-text-faint)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {deviceLabel(s.userAgent)}
            </span>
            <StatusBadge status={s.status} />
          </div>
          <p
            className="text-[12px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            <span className="font-mono">{s.ip ?? "—"}</span> · opened{" "}
            {dateFmt.format(s.createdAt)} ·{" "}
            <span title={dateTimeFmt.format(s.lastSeenAt)}>
              last seen {relativeTime(s.lastSeenAt)}
            </span>
            {s.revokedAt && (
              <>
                {" "}· revoked {dateFmt.format(s.revokedAt)}
              </>
            )}
          </p>
          {error && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-red-600">
              <AlertCircle size={12} />
              {error}
            </p>
          )}
        </div>
        {canRevoke && (
          <button
            type="button"
            onClick={() => setConfirmRevokeOpen(true)}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors hover:bg-red-50 disabled:opacity-40 inline-flex items-center gap-1.5"
            style={{ color: "#dc2626" }}>
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <X size={12} />
            )}
            Revoke
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmRevokeOpen}
        title="Revoke session"
        message="The device will be signed out immediately. The user will need to sign in again."
        variant="danger"
        confirmLabel="Revoke"
        loading={pending}
        onConfirm={async () => {
          setConfirmRevokeOpen(false);
          await doRevoke();
        }}
        onCancel={() => setConfirmRevokeOpen(false)}
      />
    </li>
  );
}

export function UserSessionsTab({
  userId,
  sessions,
  isDeleted,
}: {
  userId: string;
  sessions: SessionVM[];
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const activeCount = sessions.filter((s) => s.status === "active").length;

  function handleRevokeAll() {
    setError(null);
    startTransition(async () => {
      try {
        const { revokedCount } = await revokeAllSessionsForUserAdmin(userId);
        if (revokedCount === 0) {
          setError("No active sessions to revoke.");
        } else {
          router.refresh();
        }
        setConfirmAll(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revoke failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 flex items-center justify-between flex-wrap gap-3"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div>
          <h4
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Sessions
          </h4>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {activeCount === 0
              ? "No active sessions for this user."
              : activeCount === 1
                ? "1 active session"
                : `${activeCount} active sessions`}{" "}
            · {sessions.length} total in history (last 100)
          </p>
        </div>
        {activeCount > 0 && !isDeleted && (
          <div className="flex items-center gap-2">
            {!confirmAll ? (
              <button
                type="button"
                onClick={() => setConfirmAll(true)}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-semibold rounded-md text-white inline-flex items-center gap-1.5 transition-colors"
                style={{ background: "#b91c1c" }}>
                <ShieldOff size={13} />
                Force-logout all devices
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span
                  className="text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}>
                  Revoke {activeCount} active{" "}
                  {activeCount === 1 ? "session" : "sessions"}?
                </span>
                <button
                  type="button"
                  onClick={handleRevokeAll}
                  disabled={pending}
                  className="px-3 py-1 text-xs font-semibold rounded-md text-white"
                  style={{ background: "#dc2626" }}>
                  {pending ? "Revoking…" : "Confirm"}
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
      </div>

      {error && (
        <p className="inline-flex items-center gap-1 text-[12px] text-red-600">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {sessions.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            This user has no recorded sessions.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} s={s} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}
