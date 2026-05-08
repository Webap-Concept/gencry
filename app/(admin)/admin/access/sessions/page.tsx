import { getAdminPath } from "@/lib/admin-paths";
import {
  type AdminSessionStatus,
  type AlertSeverityFilter,
  type AlertStatusFilter,
  getAdminSessionsKpis,
  listAdminAlerts,
  listAdminSessions,
  parseAdminSessionStatus,
} from "@/lib/db/admin-sessions-queries";
import { countUnacknowledgedAlerts } from "@/lib/notifications/generators/suspicious-sessions";
import { Activity, Search, ShieldAlert, Wifi } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { AlertsTable } from "./_components/alerts-table";
import { SessionsAdminGuide } from "./_components/sessions-guide";
import { SessionsTable } from "./_components/sessions-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.access.sessions");
  return { title: t("metaTitle") };
}

const PER_PAGE = 25;

function KpiCard({
  label,
  value,
  hint,
  accent,
  locale,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
  locale: string;
}) {
  return (
    <div
      className="rounded-xl shadow-sm p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <p
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </p>
      <p
        className="text-2xl font-bold mt-1"
        style={{
          color: accent ? "var(--admin-accent)" : "var(--admin-text)",
        }}>
        {value.toLocaleString(locale === "en" ? "en-US" : "it-IT")}
      </p>
      {hint && (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

async function KpisRow() {
  const t = await getTranslations("admin.access.sessions");
  const locale = await getLocale();
  const [kpis, alertCounts] = await Promise.all([
    getAdminSessionsKpis(),
    countUnacknowledgedAlerts(),
  ]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KpiCard
        label={t("kpiActiveNow")}
        value={kpis.activeNow}
        accent
        locale={locale}
      />
      <KpiCard
        label={t("kpiUsersOnline")}
        value={kpis.uniqueUsersOnline}
        hint={t("kpiUsersOnlineHint")}
        locale={locale}
      />
      <KpiCard
        label={t("kpiNew24h")}
        value={kpis.createdLast24h}
        hint={t("kpiNew24hHint")}
        locale={locale}
      />
      <KpiCard
        label={t("kpiRevoked24h")}
        value={kpis.revokedLast24h}
        hint={t("kpiRevoked24hHint")}
        locale={locale}
      />
      <KpiCard
        label={t("kpiOpenAlerts")}
        value={alertCounts.total}
        hint={
          alertCounts.critical > 0
            ? t("kpiAlertsHintCritical", {
                critical: alertCounts.critical,
                warning: alertCounts.warning,
              })
            : t("kpiAlertsHintNoCritical", {
                warning: alertCounts.warning,
                info: alertCounts.info,
              })
        }
        accent={alertCounts.critical > 0}
        locale={locale}
      />
    </div>
  );
}

function KpisSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[88px] rounded-xl animate-pulse"
          style={{
            background: "var(--admin-hover-bg)",
            border: "1px solid var(--admin-card-border)",
          }}
        />
      ))}
    </div>
  );
}

async function SessionsContent({
  search,
  ip,
  status,
  page,
}: {
  search: string;
  ip: string;
  status: AdminSessionStatus;
  page: number;
}) {
  const t = await getTranslations("admin.access.sessions");
  const { items, total } = await listAdminSessions({
    search,
    ip,
    status,
    page,
    perPage: PER_PAGE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const sessionsBase = await getAdminPath("users-sessions");

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (ip) params.set("ip", ip);
    if (status !== "active") params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${sessionsBase}${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <p className="text-sm -mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {t("totalSessions", { count: total })}
      </p>

      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <SessionsTable items={items} />

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid var(--admin-divider)" }}>
            <span
              className="text-xs"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("paginationLabel", { page, total: totalPages })}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildHref(page - 1)}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-muted)",
                  }}>
                  {t("paginationPrev")}
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildHref(page + 1)}
                  className="px-3 py-1.5 text-xs text-white rounded-lg transition-colors"
                  style={{ background: "var(--admin-accent)" }}>
                  {t("paginationNext")}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SessionsTableSkeleton() {
  return (
    <div
      className="rounded-xl shadow-sm p-4 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-full animate-pulse shrink-0"
            style={{ background: "var(--admin-hover-bg)" }}
          />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 rounded animate-pulse w-1/3"
              style={{ background: "var(--admin-hover-bg)" }}
            />
            <div
              className="h-2.5 rounded animate-pulse w-2/3"
              style={{ background: "var(--admin-divider)" }}
            />
          </div>
          <div
            className="h-6 w-20 rounded-full animate-pulse"
            style={{ background: "var(--admin-hover-bg)" }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts content (when ?tab=alerts)
// ---------------------------------------------------------------------------

const VALID_ALERT_STATUSES: AlertStatusFilter[] = [
  "open",
  "acknowledged",
  "all",
];
const VALID_ALERT_SEVERITIES: AlertSeverityFilter[] = [
  "all",
  "info",
  "warning",
  "critical",
];

function parseAlertStatus(raw: string | undefined): AlertStatusFilter {
  return VALID_ALERT_STATUSES.includes(raw as AlertStatusFilter)
    ? (raw as AlertStatusFilter)
    : "open";
}
function parseAlertSeverity(raw: string | undefined): AlertSeverityFilter {
  return VALID_ALERT_SEVERITIES.includes(raw as AlertSeverityFilter)
    ? (raw as AlertSeverityFilter)
    : "all";
}

const ALERTS_PER_PAGE = 25;

async function AlertsContent({
  status,
  severity,
  page,
}: {
  status: AlertStatusFilter;
  severity: AlertSeverityFilter;
  page: number;
}) {
  const t = await getTranslations("admin.access.sessions");
  const { items, total } = await listAdminAlerts({
    status,
    severity,
    page,
    perPage: ALERTS_PER_PAGE,
  });
  const totalPages = Math.max(1, Math.ceil(total / ALERTS_PER_PAGE));
  const alertsBase = await getAdminPath("users-sessions");

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("tab", "alerts");
    if (status !== "open") params.set("alertStatus", status);
    if (severity !== "all") params.set("severity", severity);
    if (p > 1) params.set("page", String(p));
    return `${alertsBase}?${params.toString()}`;
  };

  return (
    <>
      <p className="text-sm -mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {t("totalAlerts", { count: total })}
      </p>

      <div
        className="rounded-xl shadow-sm overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <AlertsTable items={items} />

        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid var(--admin-divider)" }}>
            <span
              className="text-xs"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("paginationLabel", { page, total: totalPages })}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={buildHref(page - 1)}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-muted)",
                  }}>
                  {t("paginationPrev")}
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildHref(page + 1)}
                  className="px-3 py-1.5 text-xs text-white rounded-lg transition-colors"
                  style={{ background: "var(--admin-accent)" }}>
                  {t("paginationNext")}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    ip?: string;
    status?: string;
    alertStatus?: string;
    severity?: string;
    page?: string;
  }>;
}) {
  const t = await getTranslations("admin.access.sessions");
  const params = await searchParams;
  const tab: "sessions" | "alerts" = params.tab === "alerts" ? "alerts" : "sessions";
  const search = params.q ?? "";
  const ip = params.ip ?? "";
  const status = parseAdminSessionStatus(params.status);
  const alertStatus = parseAlertStatus(params.alertStatus);
  const severity = parseAlertSeverity(params.severity);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const hasSessionFilters = !!(search || ip || status !== "active");
  const hasAlertFilters = !!(alertStatus !== "open" || severity !== "all");

  const [sessionsHref, notificationsHref] = await Promise.all([
    getAdminPath("users-sessions"),
    getAdminPath("settings-notifications"),
  ]);
  const alertsHref = `${sessionsHref}?tab=alerts`;

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Activity}
        breadcrumbLabel={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={t("guideTitle")}
            ariaLabel={t("guideAriaLabel")}>
            <SessionsAdminGuide />
          </AdminSectionInfo>
        }
      />

      <Suspense fallback={<KpisSkeleton />}>
        <KpisRow />
      </Suspense>

      {/* Tab switcher */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl"
        style={{ background: "var(--admin-hover-bg)" }}>
        <Link
          href={sessionsHref}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
          style={{
            background: tab === "sessions" ? "var(--admin-accent)" : "transparent",
            color: tab === "sessions" ? "#fff" : "var(--admin-text-muted)",
          }}>
          <Activity size={13} />
          {t("tabSessions")}
        </Link>
        <Link
          href={alertsHref}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
          style={{
            background: tab === "alerts" ? "var(--admin-accent)" : "transparent",
            color: tab === "alerts" ? "#fff" : "var(--admin-text-muted)",
          }}>
          <ShieldAlert size={13} />
          {t("tabAlerts")}
        </Link>
      </div>

      {tab === "sessions" ? (
        <>
          <div
            className="rounded-xl shadow-sm p-4"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <form className="flex flex-wrap gap-3">
              <input type="hidden" name="tab" value="sessions" />
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--admin-text-faint)" }}
                />
                <input
                  name="q"
                  defaultValue={search}
                  placeholder={t("filterSearchPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>

              <div className="relative min-w-[180px]">
                <Wifi
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--admin-text-faint)" }}
                />
                <input
                  name="ip"
                  defaultValue={ip}
                  placeholder={t("filterIpPlaceholder")}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>

              <select
                name="status"
                defaultValue={status}
                className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: status ? "var(--admin-text)" : "var(--admin-text-muted)",
                }}>
                <option value="active">{t("filterStatusActive")}</option>
                <option value="revoked">{t("filterStatusRevoked")}</option>
                <option value="expired">{t("filterStatusExpired")}</option>
                <option value="all">{t("filterStatusAll")}</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
                style={{ background: "var(--admin-accent)" }}>
                {t("filterButton")}
              </button>

              {hasSessionFilters && (
                <a
                  href={sessionsHref}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-muted)",
                  }}>
                  {t("resetButton")}
                </a>
              )}
            </form>
          </div>

          <Suspense
            key={`s|${search}|${ip}|${status}|${page}`}
            fallback={<SessionsTableSkeleton />}>
            <SessionsContent
              search={search}
              ip={ip}
              status={status}
              page={page}
            />
          </Suspense>
        </>
      ) : (
        <>
          <div
            className="rounded-xl shadow-sm p-4"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <form className="flex flex-wrap gap-3 items-end">
              <input type="hidden" name="tab" value="alerts" />

              <div className="space-y-1">
                <label
                  className="text-[11px] uppercase tracking-wide font-medium"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("alertStatusLabel")}
                </label>
                <select
                  name="alertStatus"
                  defaultValue={alertStatus}
                  className="px-3 py-2 text-sm rounded-lg"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}>
                  <option value="open">{t("alertStatusOpen")}</option>
                  <option value="acknowledged">
                    {t("alertStatusAcknowledged")}
                  </option>
                  <option value="all">{t("alertStatusAll")}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  className="text-[11px] uppercase tracking-wide font-medium"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("severityLabel")}
                </label>
                <select
                  name="severity"
                  defaultValue={severity}
                  className="px-3 py-2 text-sm rounded-lg"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}>
                  <option value="all">{t("severityAll")}</option>
                  <option value="critical">{t("severityCritical")}</option>
                  <option value="warning">{t("severityWarning")}</option>
                  <option value="info">{t("severityInfo")}</option>
                </select>
              </div>

              <button
                type="submit"
                className="px-4 py-2 text-white text-sm font-medium rounded-lg"
                style={{ background: "var(--admin-accent)" }}>
                {t("filterButton")}
              </button>

              {hasAlertFilters && (
                <a
                  href={alertsHref}
                  className="px-4 py-2 text-sm font-medium rounded-lg"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-muted)",
                  }}>
                  {t("resetButton")}
                </a>
              )}

              <span
                className="ml-auto text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("detectionInfoBefore")}{" "}
                <a
                  href={notificationsHref}
                  className="underline"
                  style={{ color: "var(--admin-accent)" }}>
                  {t("detectionInfoLink")}
                </a>
              </span>
            </form>
          </div>

          <Suspense
            key={`a|${alertStatus}|${severity}|${page}`}
            fallback={<SessionsTableSkeleton />}>
            <AlertsContent
              status={alertStatus}
              severity={severity}
              page={page}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
