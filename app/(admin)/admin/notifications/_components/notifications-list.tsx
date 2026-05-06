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
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const TAB_KEYS = ["active", "snoozed", "dismissed", "resolved", "all"] as const;

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

/**
 * Action button della lista: hover background, loader durante l'azione,
 * disabled (e meno opaco) se un'altra azione e' in volo.
 */
function ActionButton({
  busy,
  disabled,
  onClick,
  icon,
  label,
}: {
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const inert = busy || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      onMouseEnter={(e) => {
        if (inert) return;
        e.currentTarget.style.background = "var(--admin-hover-bg)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors disabled:cursor-default"
      style={{
        color: "var(--admin-text-muted)",
        border: "1px solid var(--admin-card-border)",
        opacity: disabled && !busy ? 0.5 : 1,
      }}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function formatDate(iso: string, locale: string): string {
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  return new Date(iso).toLocaleString(dateLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StatusKey = "dismissed" | "resolved" | "snoozed" | "read" | "unread";

function statusBadgeKey(n: ClientNotification): {
  key: StatusKey;
  color: string;
} {
  if (n.dismissedAt) return { key: "dismissed", color: "#94a3b8" };
  if (n.resolvedAt) return { key: "resolved", color: "#22c55e" };
  if (n.snoozedUntil && new Date(n.snoozedUntil).getTime() > Date.now()) {
    return { key: "snoozed", color: "#f59e0b" };
  }
  if (n.readAt) return { key: "read", color: "var(--admin-text-faint)" };
  return { key: "unread", color: "var(--admin-accent)" };
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
  const t = useTranslations("admin.notifications");
  const locale = useLocale();
  // Chiave dell'azione in volo: "snooze:<id>" o "dismiss:<id>". Una sola
  // alla volta — vedi commento analogo in NotificationBell.
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

  function buildHref(status: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("status", status);
    return `/admin/notifications?${sp.toString()}`;
  }

  function handleSnooze(id: string) {
    void runAction(`snooze:${id}`, () => snoozeAction(id));
  }
  function handleDismiss(id: string) {
    void runAction(`dismiss:${id}`, () => dismissAction(id));
  }
  function handleRowClick(n: ClientNotification) {
    if (!n.readAt) void markReadAction(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}>
        {TAB_KEYS.map((key) => {
          const active = key === currentStatus;
          return (
            <Link
              key={key}
              href={buildHref(key)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                background: active ? "var(--admin-accent)" : "transparent",
                color: active ? "white" : "var(--admin-text-muted)",
              }}>
              {t(`tabs.${key}`)}
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
            {t("empty")}
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
            const badge = statusBadgeKey(n);
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
                      {t(`status.${badge.key}`)}
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
                    <span>{formatDate(n.createdAt, locale)}</span>
                    {n.snoozedUntil && (
                      <span>
                        {t("snoozedUntil", {
                          date: formatDate(n.snoozedUntil, locale),
                        })}
                      </span>
                    )}
                    {n.link && (
                      <Link
                        href={n.link}
                        className="underline underline-offset-2"
                        style={{ color: "var(--admin-accent)" }}>
                        {t("goToSection")}
                      </Link>
                    )}
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-2 mt-2">
                      <ActionButton
                        busy={busyKey === `snooze:${n.id}`}
                        disabled={busyKey !== null}
                        onClick={() => handleSnooze(n.id)}
                        icon={<Clock size={11} />}
                        label={t("actions.snoozeSevenDays")}
                      />
                      <ActionButton
                        busy={busyKey === `dismiss:${n.id}`}
                        disabled={busyKey !== null}
                        onClick={() => handleDismiss(n.id)}
                        icon={<X size={11} />}
                        label={t("actions.dismiss")}
                      />
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
