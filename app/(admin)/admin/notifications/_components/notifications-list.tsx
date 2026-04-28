"use client";

import {
  dismissAction,
  markReadAction,
  snoozeAction,
} from "@/lib/notifications/actions";
import type { ClientNotification } from "@/lib/notifications/serializers";
import {
  AlertTriangle,
  Bell,
  Clock,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const TABS: Array<{ key: string; label: string }> = [
  { key: "active", label: "Attive" },
  { key: "snoozed", label: "Rinviate" },
  { key: "dismissed", label: "Ignorate" },
  { key: "resolved", label: "Risolte" },
  { key: "all", label: "Tutte" },
];

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
  if (s === "critical") return <ShieldAlert size={16} style={{ color }} />;
  if (s === "warning") return <AlertTriangle size={16} style={{ color }} />;
  return <Info size={16} style={{ color }} />;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(n: ClientNotification): {
  label: string;
  color: string;
} {
  if (n.dismissedAt) return { label: "Ignorata", color: "#94a3b8" };
  if (n.resolvedAt) return { label: "Risolta", color: "#22c55e" };
  if (n.snoozedUntil && new Date(n.snoozedUntil).getTime() > Date.now()) {
    return { label: "Rinviata", color: "#f59e0b" };
  }
  if (n.readAt) return { label: "Letta", color: "var(--admin-text-faint)" };
  return { label: "Non letta", color: "var(--admin-accent)" };
}

export function NotificationsList({
  notifications,
  currentStatus,
}: {
  notifications: ClientNotification[];
  currentStatus: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function buildHref(status: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("status", status);
    return `/admin/notifications?${sp.toString()}`;
  }

  function handleSnooze(id: string) {
    startTransition(() => snoozeAction(id));
  }
  function handleDismiss(id: string) {
    startTransition(() => dismissAction(id));
  }
  function handleRowClick(n: ClientNotification) {
    if (!n.readAt) startTransition(() => markReadAction(n.id));
    if (n.link) router.push(n.link);
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}>
        {TABS.map((t) => {
          const active = t.key === currentStatus;
          return (
            <Link
              key={t.key}
              href={buildHref(t.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                background: active ? "var(--admin-accent)" : "transparent",
                color: active ? "white" : "var(--admin-text-muted)",
              }}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Empty */}
      {notifications.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <Bell
            size={28}
            className="mb-2"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
            Nessuna notifica in questa categoria.
          </p>
        </div>
      )}

      {/* Lista */}
      {notifications.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {notifications.map((n) => {
            const badge = statusBadge(n);
            const isActive = !n.dismissedAt && !n.resolvedAt;
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: "1px solid var(--admin-divider)" }}>
                <div className="mt-0.5">
                  <SeverityIcon s={n.severity} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleRowClick(n)}
                      className="text-sm font-semibold text-left"
                      style={{ color: "var(--admin-text)" }}>
                      {n.title}
                    </button>
                    <span
                      className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded shrink-0"
                      style={{
                        color: badge.color,
                        border: `1px solid ${badge.color}`,
                      }}>
                      {badge.label}
                    </span>
                  </div>
                  {n.body && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--admin-text-muted)" }}>
                      {n.body}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-2 text-[11px]"
                    style={{ color: "var(--admin-text-faint)" }}>
                    <span>{formatDate(n.createdAt)}</span>
                    {n.snoozedUntil && (
                      <span>· Rinviata fino al {formatDate(n.snoozedUntil)}</span>
                    )}
                    {n.link && (
                      <Link
                        href={n.link}
                        className="underline underline-offset-2"
                        style={{ color: "var(--admin-accent)" }}>
                        Vai alla sezione
                      </Link>
                    )}
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleSnooze(n.id)}
                        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                        style={{
                          color: "var(--admin-text-muted)",
                          border: "1px solid var(--admin-card-border)",
                        }}>
                        <Clock size={11} />
                        Rinvia 7 giorni
                      </button>
                      <button
                        onClick={() => handleDismiss(n.id)}
                        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                        style={{
                          color: "var(--admin-text-muted)",
                          border: "1px solid var(--admin-card-border)",
                        }}>
                        <X size={11} />
                        Ignora
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
