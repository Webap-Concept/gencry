// app/(admin)/admin/logs/_components/logs-client.tsx
"use client";

import { ActivityType } from "@/lib/db/schema";
import type { PaginatedLogs } from "@/lib/db/types";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileEdit,
  FilePlus2,
  FileText,
  FileX2,
  Filter,
  KeyRound,
  LayoutTemplate,
  LogIn,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// LogEntry and PaginatedLogs are now in @/lib/db/types — do not redefine here.

type Props = { data: PaginatedLogs };

const TABS = [
  { id: "rbac", icon: KeyRound },
  { id: "auth", icon: LogIn },
  { id: "pages", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

const AUTH_TYPES = new Set([
  ActivityType.SIGN_IN,
  ActivityType.SIGN_UP,
  ActivityType.SIGN_OUT,
  ActivityType.UPDATE_PASSWORD,
  ActivityType.PASSWORD_RESET_REQUESTED,
  ActivityType.PASSWORD_RESET_COMPLETED,
  ActivityType.EMAIL_VERIFIED,
]);

const CONTENT_TYPES = new Set([
  ActivityType.PAGE_CREATED,
  ActivityType.PAGE_UPDATED,
  ActivityType.PAGE_DELETED,
  ActivityType.PAGE_PUBLISHED,
  ActivityType.PAGE_UNPUBLISHED,
  ActivityType.TEMPLATE_CREATED,
  ActivityType.TEMPLATE_UPDATED,
  ActivityType.TEMPLATE_DELETED,
]);

function getActionType(action: string): ActivityType | null {
  const part = action.split(" | ")[0].trim() as ActivityType;
  return Object.values(ActivityType).includes(part) ? part : null;
}

function getDetail(action: string): string {
  const parts = action.split(" | ");
  return parts.length > 1 ? parts.slice(1).join(" | ") : "";
}

function ActionIcon({ type }: { type: ActivityType | null }) {
  if (!type) return <Activity size={13} />;
  // RBAC
  if (
    type === ActivityType.PERMISSION_GRANTED ||
    type === ActivityType.ROLE_PERMISSION_ADDED
  )
    return <ShieldCheck size={13} style={{ color: "#16a34a" }} />;
  if (
    type === ActivityType.PERMISSION_REVOKED ||
    type === ActivityType.ROLE_PERMISSION_REMOVED
  )
    return <ShieldOff size={13} style={{ color: "#dc2626" }} />;
  if (type === ActivityType.ADMIN_CHANGE_ROLE)
    return <UserCog size={13} style={{ color: "#7c3aed" }} />;
  if (
    type === ActivityType.ADMIN_BAN_USER ||
    type === ActivityType.ADMIN_DELETE_USER
  )
    return <Trash2 size={13} style={{ color: "#dc2626" }} />;
  if (type === ActivityType.ADMIN_UNBAN_USER)
    return <Shield size={13} style={{ color: "#16a34a" }} />;
  // Auth
  if (AUTH_TYPES.has(type))
    return <LogIn size={13} style={{ color: "#0284c7" }} />;
  // Content — pages
  if (type === ActivityType.PAGE_CREATED)
    return <FilePlus2 size={13} style={{ color: "#16a34a" }} />;
  if (type === ActivityType.PAGE_UPDATED)
    return <FileEdit size={13} style={{ color: "#0284c7" }} />;
  if (type === ActivityType.PAGE_DELETED)
    return <FileX2 size={13} style={{ color: "#dc2626" }} />;
  if (type === ActivityType.PAGE_PUBLISHED)
    return <Eye size={13} style={{ color: "#16a34a" }} />;
  if (type === ActivityType.PAGE_UNPUBLISHED)
    return <EyeOff size={13} style={{ color: "#d97706" }} />;
  // Content — template
  if (type === ActivityType.TEMPLATE_CREATED)
    return <LayoutTemplate size={13} style={{ color: "#16a34a" }} />;
  if (type === ActivityType.TEMPLATE_UPDATED)
    return <LayoutTemplate size={13} style={{ color: "#0284c7" }} />;
  if (type === ActivityType.TEMPLATE_DELETED)
    return <LayoutTemplate size={13} style={{ color: "#dc2626" }} />;
  return <Activity size={13} />;
}

function TypeBadge({ type }: { type: ActivityType | null }) {
  if (!type) return null;
  const label = type.replace(/_/g, " ");
  let bg = "var(--admin-hover-bg)";
  let color = "var(--admin-text-muted)";

  // RBAC
  if (
    type === ActivityType.PERMISSION_GRANTED ||
    type === ActivityType.ROLE_PERMISSION_ADDED
  ) {
    bg = "#dcfce7";
    color = "#15803d";
  } else if (
    type === ActivityType.PERMISSION_REVOKED ||
    type === ActivityType.ROLE_PERMISSION_REMOVED
  ) {
    bg = "#fef2f2";
    color = "#dc2626";
  } else if (type === ActivityType.ADMIN_CHANGE_ROLE) {
    bg = "#f3e8ff";
    color = "#7c3aed";
  } else if (
    type === ActivityType.ADMIN_BAN_USER ||
    type === ActivityType.ADMIN_DELETE_USER
  ) {
    bg = "#fef2f2";
    color = "#b91c1c";
  } else if (type === ActivityType.ADMIN_UNBAN_USER) {
    bg = "#dcfce7";
    color = "#166534";
    // Auth
  } else if (AUTH_TYPES.has(type)) {
    bg = "#e0f2fe";
    color = "#0369a1";
    // Content
  } else if (
    type === ActivityType.PAGE_CREATED ||
    type === ActivityType.TEMPLATE_CREATED
  ) {
    bg = "#dcfce7";
    color = "#15803d";
  } else if (
    type === ActivityType.PAGE_UPDATED ||
    type === ActivityType.TEMPLATE_UPDATED
  ) {
    bg = "#eff6ff";
    color = "#1d4ed8";
  } else if (
    type === ActivityType.PAGE_DELETED ||
    type === ActivityType.TEMPLATE_DELETED
  ) {
    bg = "#fef2f2";
    color = "#b91c1c";
  } else if (type === ActivityType.PAGE_PUBLISHED) {
    bg = "#dcfce7";
    color = "#15803d";
  } else if (type === ActivityType.PAGE_UNPUBLISHED) {
    bg = "#fffbeb";
    color = "#92400e";
  }

  return (
    <span
      className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: bg, color }}>
      {label}
    </span>
  );
}

export function LogsClient({ data }: Props) {
  const { logs, total, page, perPage, totalPages } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("admin.logs");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";

  const activeTab = (searchParams.get("tab") ?? "rbac") as TabId;
  const [search, setSearch] = useState("");

  function navigate(newPage: number, newTab?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    if (newTab !== undefined) params.set("tab", newTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  const filtered = search.trim()
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          (l.userEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (l.ipAddress ?? "").includes(search),
      )
    : logs;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="space-y-4">
      {/* Tab bar + search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div
          className="flex items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: "var(--admin-hover-bg)" }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(1, tab.id)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
                style={{
                  background: isActive ? "var(--admin-accent)" : "transparent",
                  color: isActive ? "#fff" : "var(--admin-text-muted)",
                  boxShadow: isActive
                    ? "0 1px 3px oklch(0 0 0 / 0.15)"
                    : "none",
                }}>
                <Icon size={13} />
                {t(`tabs.${tab.id}`)}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 text-sm rounded-lg outline-none border w-64"
            style={{
              background: "var(--admin-bg)",
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>
      </div>

      {/* Active filter info */}
      {search && (
        <div className="flex items-center gap-2">
          <Filter size={12} style={{ color: "var(--admin-text-faint)" }} />
          <span
            className="text-xs"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("filterResults", { count: filtered.length, query: search })}
          </span>
          <button
            onClick={() => setSearch("")}
            className="text-xs underline"
            style={{ color: "var(--admin-accent)" }}>
            {t("filterClear")}
          </button>
        </div>
      )}

      {/* Log list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--admin-card-border)" }}>
        {filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 gap-2"
            style={{ background: "var(--admin-card-bg)" }}>
            <Activity
              size={28}
              style={{ opacity: 0.2, color: "var(--admin-text)" }}
            />
            <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
              {t("empty")}
            </p>
          </div>
        ) : (
          <div style={{ background: "var(--admin-card-bg)" }}>
            {filtered.map((log, i) => {
              const type = getActionType(log.action);
              const detail = getDetail(log.action);
              const isLast = i === filtered.length - 1;
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    borderBottom: isLast
                      ? "none"
                      : "1px solid var(--admin-card-border)",
                  }}>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--admin-hover-bg)" }}>
                    <ActionIcon type={type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={type} />
                      {detail && (
                        <code
                          className="text-[11px] font-mono truncate max-w-[400px]"
                          style={{ color: "var(--admin-text-muted)" }}
                          title={detail}>
                          {detail}
                        </code>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {log.userEmail && (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--admin-text-faint)" }}>
                          {log.userEmail}
                        </span>
                      )}
                      {log.ipAddress && (
                        <span
                          className="text-[11px] font-mono"
                          style={{ color: "var(--admin-text-faint)" }}>
                          {log.ipAddress}
                        </span>
                      )}
                    </div>
                  </div>
                  <time
                    className="text-[11px] shrink-0 tabular-nums"
                    style={{ color: "var(--admin-text-faint)" }}
                    title={new Date(log.timestamp).toISOString()}>
                    {new Date(log.timestamp).toLocaleString(dateLocale, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("paginationRange", { start, end, total })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(page - 1)}
              disabled={page <= 1}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text-muted)",
              }}
              onMouseEnter={(e) => {
                if (page > 1)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--admin-hover-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
              aria-label={t("previousPage")}>
              <ChevronLeft size={15} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
              )
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                  acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === "..." ? (
                  <span
                    key={`dots-${idx}`}
                    className="w-8 text-center text-xs"
                    style={{ color: "var(--admin-text-faint)" }}>
                    &hellip;
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => navigate(p as number)}
                    className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background:
                        p === page ? "var(--admin-accent)" : "transparent",
                      color: p === page ? "#fff" : "var(--admin-text-muted)",
                      border:
                        p === page
                          ? "none"
                          : "1px solid var(--admin-card-border)",
                    }}
                    onMouseEnter={(e) => {
                      if (p !== page)
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "var(--admin-hover-bg)";
                    }}
                    onMouseLeave={(e) => {
                      if (p !== page)
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "transparent";
                    }}>
                    {p}
                  </button>
                ),
              )}

            <button
              onClick={() => navigate(page + 1)}
              disabled={page >= totalPages}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text-muted)",
              }}
              onMouseEnter={(e) => {
                if (page < totalPages)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--admin-hover-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
              aria-label={t("nextPage")}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {totalPages <= 1 && (
        <p
          className="text-xs text-right"
          style={{ color: "var(--admin-text-faint)" }}>
          {t("paginationSingle", { total })}
        </p>
      )}
    </div>
  );
}
