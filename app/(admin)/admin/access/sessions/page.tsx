import { getAdminPath } from "@/lib/admin-nav";
import {
  type AdminSessionStatus,
  getAdminSessionsKpis,
  listAdminSessions,
  parseAdminSessionStatus,
} from "@/lib/db/admin-sessions-queries";
import { Activity, Search, Wifi } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionsTable } from "./_components/sessions-table";

export const metadata: Metadata = { title: "Sessions" };

const PER_PAGE = 25;

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
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
        {value.toLocaleString("en-US")}
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
  const kpis = await getAdminSessionsKpis();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="Active now" value={kpis.activeNow} accent />
      <KpiCard
        label="Users online"
        value={kpis.uniqueUsersOnline}
        hint="Distinct users with an active session"
      />
      <KpiCard
        label="New (24h)"
        value={kpis.createdLast24h}
        hint="Sessions opened in the last 24h"
      />
      <KpiCard
        label="Revoked (24h)"
        value={kpis.revokedLast24h}
        hint="Manually revoked or kicked"
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
  const { items, total } = await listAdminSessions({
    search,
    ip,
    status,
    page,
    perPage: PER_PAGE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (ip) params.set("ip", ip);
    if (status !== "active") params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${getAdminPath("users-sessions")}${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <p className="text-sm -mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {total.toLocaleString("en-US")} sessions match these filters
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
              Page {page} of {totalPages}
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
                  ← Previous
                </a>
              )}
              {page < totalPages && (
                <a
                  href={buildHref(page + 1)}
                  className="px-3 py-1.5 text-xs text-white rounded-lg transition-colors"
                  style={{ background: "var(--admin-accent)" }}>
                  Next →
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

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    ip?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const ip = params.ip ?? "";
  const status = parseAdminSessionStatus(params.status);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const hasFilters = !!(search || ip || status !== "active");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Activity size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--admin-text)" }}>
            Sessions
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            Monitor active sessions, audit login origins, force-logout devices
          </p>
        </div>
      </div>

      <Suspense fallback={<KpisSkeleton />}>
        <KpisRow />
      </Suspense>

      <div
        className="rounded-xl shadow-sm p-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <form className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--admin-text-faint)" }}
            />
            <input
              name="q"
              defaultValue={search}
              placeholder="Search by name, email or username..."
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
              placeholder="IP address..."
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
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
            <option value="all">All</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ background: "var(--admin-accent)" }}>
            Filter
          </button>

          {hasFilters && (
            <a
              href={getAdminPath("users-sessions")}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-muted)",
              }}>
              Reset
            </a>
          )}
        </form>
      </div>

      <Suspense
        key={`${search}|${ip}|${status}|${page}`}
        fallback={<SessionsTableSkeleton />}>
        <SessionsContent search={search} ip={ip} status={status} page={page} />
      </Suspense>
    </div>
  );
}
