"use client";

import {
  dismissAction,
  markAllReadAction,
  markReadAction,
  snoozeAction,
} from "@/lib/notifications/actions";
import type { ClientNotification } from "@/lib/notifications/serializers";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock,
  Info,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function severityColor(s: ClientNotification["severity"]): string {
  switch (s) {
    case "critical":
      return "#ef4444";
    case "warning":
      return "#f59e0b";
    case "info":
    default:
      return "var(--admin-accent)";
  }
}

function SeverityIcon({ s }: { s: ClientNotification["severity"] }) {
  const color = severityColor(s);
  if (s === "critical")
    return <ShieldAlert size={14} style={{ color }} className="shrink-0 mt-0.5" />;
  if (s === "warning")
    return <AlertTriangle size={14} style={{ color }} className="shrink-0 mt-0.5" />;
  return <Info size={14} style={{ color }} className="shrink-0 mt-0.5" />;
}

/**
 * Action button reso come <span role="button"> perche' annidato dentro la
 * riga-button della notifica (button-in-button non e' HTML valido).
 *
 * - Hover: background var(--admin-hover-bg) (coerente col resto del pannello)
 * - Busy: l'icona diventa Loader2 spinning, pointer-events disabilitati
 * - Disabled: opacity 50% e niente hover (es. mentre un'altra azione e' in volo)
 */
function ActionChip({
  busy,
  disabled,
  onActivate,
  icon,
  label,
}: {
  busy: boolean;
  disabled: boolean;
  onActivate: (e: React.MouseEvent | React.KeyboardEvent) => void;
  icon: React.ReactNode;
  label: string;
}) {
  const inert = busy || disabled;
  return (
    <span
      role="button"
      tabIndex={inert ? -1 : 0}
      aria-disabled={inert}
      onClick={(e) => {
        if (inert) {
          e.stopPropagation();
          return;
        }
        onActivate(e);
      }}
      onKeyDown={(e) => {
        if (inert) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(e);
        }
      }}
      onMouseEnter={(e) => {
        if (inert) return;
        e.currentTarget.style.background = "var(--admin-hover-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors select-none"
      style={{
        color: "var(--admin-text-muted)",
        border: "1px solid var(--admin-card-border)",
        cursor: inert ? "default" : "pointer",
        opacity: disabled && !busy ? 0.5 : 1,
      }}>
      {busy ? <Loader2 size={10} className="animate-spin" /> : icon}
      {label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: ClientNotification[];
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Chiave dell'azione attualmente in volo, es. "snooze:<id>" / "dismiss:<id>" /
  // "markAll" / "read:<id>". Una sola azione per click — basta a evitare che
  // l'utente cliccando un bottone non ottenga feedback (era il problema UX).
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function runAction(key: string, fn: () => Promise<void>) {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const items = initialNotifications;
  const unread = initialUnreadCount;
  const empty = items.length === 0;

  function handleRowClick(n: ClientNotification) {
    if (!n.readAt) {
      // Fire-and-forget: la riga si muove subito (link push), il
      // markRead viaggia in background. Non bloccante per l'UX.
      void markReadAction(n.id);
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  function handleSnooze(
    e: React.MouseEvent | React.KeyboardEvent,
    id: string,
  ) {
    e.stopPropagation();
    void runAction(`snooze:${id}`, () => snoozeAction(id));
  }

  function handleDismiss(
    e: React.MouseEvent | React.KeyboardEvent,
    id: string,
  ) {
    e.stopPropagation();
    void runAction(`dismiss:${id}`, () => dismissAction(id));
  }

  function handleMarkAll() {
    void runAction("markAll", () => markAllReadAction());
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: "var(--admin-icon-color)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--admin-hover-bg)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }>
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "#ef4444" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-xl shadow-lg z-50 overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--admin-divider)" }}>
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              Notifications {unread > 0 && `(${unread})`}
            </p>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                disabled={busyKey === "markAll"}
                className="flex items-center gap-1 text-[11px] transition-opacity disabled:opacity-50 hover:underline underline-offset-2"
                style={{ color: "var(--admin-accent)" }}>
                {busyKey === "markAll" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={12} />
                )}
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {empty && (
              <div className="px-4 py-10 text-center">
                <Bell
                  size={20}
                  className="mx-auto mb-2"
                  style={{ color: "var(--admin-text-faint)" }}
                />
                <p
                  className="text-xs"
                  style={{ color: "var(--admin-text-muted)" }}>
                  No active notifications.
                </p>
              </div>
            )}

            {items.map((n) => {
              const isUnread = n.readAt === null;
              return (
                <button
                  key={n.id}
                  onClick={() => handleRowClick(n)}
                  className="w-full text-left px-4 py-3 flex gap-3 transition-colors"
                  style={{
                    background: isUnread
                      ? "color-mix(in oklch, var(--admin-accent) 4%, transparent)"
                      : "transparent",
                    borderBottom: "1px solid var(--admin-divider)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "var(--admin-hover-bg)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = isUnread
                      ? "color-mix(in oklch, var(--admin-accent) 4%, transparent)"
                      : "transparent")
                  }>
                  <SeverityIcon s={n.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-sm font-medium leading-tight"
                        style={{
                          color: "var(--admin-text)",
                          fontWeight: isUnread ? 600 : 500,
                        }}>
                        {n.title}
                      </p>
                      <span
                        className="text-[10px] shrink-0 mt-0.5"
                        style={{ color: "var(--admin-text-faint)" }}>
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    {n.body && (
                      <p
                        className="text-xs mt-1 leading-snug"
                        style={{ color: "var(--admin-text-muted)" }}>
                        {n.body}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <ActionChip
                        busy={busyKey === `snooze:${n.id}`}
                        disabled={busyKey !== null}
                        onActivate={(e) => handleSnooze(e, n.id)}
                        icon={<Clock size={10} />}
                        label="Snooze 7 days"
                      />
                      <ActionChip
                        busy={busyKey === `dismiss:${n.id}`}
                        disabled={busyKey !== null}
                        onActivate={(e) => handleDismiss(e, n.id)}
                        icon={<X size={10} />}
                        label="Dismiss"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-xs font-medium transition-colors"
            style={{
              color: "var(--admin-accent)",
              borderTop: "1px solid var(--admin-divider)",
            }}>
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
