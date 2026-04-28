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
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}g fa`;
  const months = Math.round(days / 30);
  return `${months}mesi fa`;
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
  const [, startTransition] = useTransition();

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
      startTransition(() => {
        markReadAction(n.id);
      });
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  function handleSnooze(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    startTransition(() => snoozeAction(id));
  }

  function handleDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    startTransition(() => dismissAction(id));
  }

  function handleMarkAll() {
    startTransition(() => markAllReadAction());
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Notifiche"
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
              Notifiche {unread > 0 && `(${unread})`}
            </p>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-[11px] transition-colors"
                style={{ color: "var(--admin-accent)" }}>
                <CheckCheck size={12} />
                Segna tutte come lette
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
                  Nessuna notifica attiva.
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
                      <span
                        onClick={(e) => handleSnooze(e, n.id)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer"
                        style={{
                          color: "var(--admin-text-muted)",
                          border: "1px solid var(--admin-card-border)",
                        }}>
                        <Clock size={10} />
                        Ricordamelo tra 7g
                      </span>
                      <span
                        onClick={(e) => handleDismiss(e, n.id)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer"
                        style={{
                          color: "var(--admin-text-muted)",
                          border: "1px solid var(--admin-card-border)",
                        }}>
                        <X size={10} />
                        Ignora
                      </span>
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
            Vedi tutte
          </Link>
        </div>
      )}
    </div>
  );
}
