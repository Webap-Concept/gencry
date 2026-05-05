import { getAdminPath } from "@/lib/admin-nav";
import { type AdminUsersStatus, getAdminUsers } from "@/lib/db/admin-queries";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { Search, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import UsersTable from "./_components/users-table";

export const metadata: Metadata = { title: "Users" };

const VALID_STATUSES: AdminUsersStatus[] = [
  "active",
  "deletion_requested",
  "all",
];

function parseStatus(raw: string | undefined): AdminUsersStatus {
  return VALID_STATUSES.includes(raw as AdminUsersStatus)
    ? (raw as AdminUsersStatus)
    : "active";
}

async function UsersContent({
  search,
  role,
  plan,
  verified,
  status,
  page,
}: {
  search: string;
  role: string;
  plan: string;
  verified: string;
  status: AdminUsersStatus;
  page: number;
}) {
  const t = await getTranslations("admin.access.users");
  const { users, total } = await getAdminUsers({
    search,
    role,
    plan,
    verified,
    status,
    page,
  });
  const totalPages = Math.ceil(total / 20);

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (role) params.set("role", role);
    if (plan) params.set("plan", plan);
    if (verified) params.set("verified", verified);
    if (status !== "active") params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${getAdminPath("users-list")}${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <p className="text-sm -mt-4" style={{ color: "var(--admin-text-faint)" }}>
        {t("totalCount", { count: total })}
      </p>

      <div
        className="rounded-xl shadow-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <UsersTable users={users} status={status} />

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

function UsersTableSkeleton() {
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
              className="h-2.5 rounded animate-pulse w-1/2"
              style={{ background: "var(--admin-divider)" }}
            />
          </div>
          <div
            className="h-5 w-16 rounded-full animate-pulse"
            style={{ background: "var(--admin-hover-bg)" }}
          />
          <div
            className="h-5 w-14 rounded-full animate-pulse"
            style={{ background: "var(--admin-hover-bg)" }}
          />
          <div
            className="h-5 w-20 rounded animate-pulse"
            style={{ background: "var(--admin-hover-bg)" }}
          />
        </div>
      ))}
    </div>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    plan?: string;
    verified?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const t = await getTranslations("admin.access.users");
  const params = await searchParams;
  const search = params.q ?? "";
  const role = params.role ?? "";
  const plan = params.plan ?? "";
  const verified = params.verified ?? "";
  const status = parseStatus(params.status);
  const page = Number(params.page ?? 1);

  const allRoles = await getAdminRoles();
  const hasFilters = !!(
    search ||
    role ||
    plan ||
    verified ||
    status !== "active"
  );

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
          <Users size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--admin-text)" }}>
            {t("pageTitle")}
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("pageSubtitle")}
          </p>
        </div>
      </div>

      <div
        className="rounded-xl shadow-sm p-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <form className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--admin-text-faint)" }}
            />
            <input
              name="q"
              defaultValue={search}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}
            />
          </div>

          <select
            name="role"
            defaultValue={role}
            className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: role ? "var(--admin-text)" : "var(--admin-text-muted)",
            }}>
            <option value="">{t("filterRoleAll")}</option>
            {allRoles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </select>

          <select
            name="plan"
            defaultValue={plan}
            className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: plan ? "var(--admin-text)" : "var(--admin-text-muted)",
            }}>
            <option value="">{t("filterPlanAll")}</option>
            <option value="free">{t("filterPlanFree")}</option>
            <option value="premium">{t("filterPlanPremium")}</option>
          </select>

          <select
            name="verified"
            defaultValue={verified}
            className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: verified ? "var(--admin-text)" : "var(--admin-text-muted)",
            }}>
            <option value="">{t("filterVerifiedAll")}</option>
            <option value="true">{t("filterVerifiedYes")}</option>
            <option value="false">{t("filterVerifiedNo")}</option>
          </select>

          <select
            name="status"
            defaultValue={status}
            className="px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color:
                status !== "active"
                  ? "var(--admin-text)"
                  : "var(--admin-text-muted)",
            }}>
            <option value="active">{t("filterStatusActive")}</option>
            <option value="deletion_requested">
              {t("filterStatusDeletionRequested")}
            </option>
            <option value="all">{t("filterStatusAll")}</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ background: "var(--admin-accent)" }}>
            {t("filterButton")}
          </button>

          {hasFilters && (
            <a
              href={getAdminPath("users-list")}
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

      <Suspense fallback={<UsersTableSkeleton />}>
        <UsersContent
          search={search}
          role={role}
          plan={plan}
          verified={verified}
          status={status}
          page={page}
        />
      </Suspense>
    </div>
  );
}
