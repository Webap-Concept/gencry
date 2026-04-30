// app/(admin)/admin/staff/page.tsx
import { getStaffUsers } from "@/lib/db/admin-queries";
import { getStaffAssignableRoles } from "@/lib/db/roles-queries";
import { Search, UserCog } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import AddStaffButton from "./_components/add-staff-button";
import StaffTable from "./_components/staff-table";

export const metadata: Metadata = { title: "Users / Staff Management" };

async function StaffContent({
  search,
  role,
  page,
}: {
  search: string;
  role: string;
  page: number;
}) {
  const { users, total } = await getStaffUsers({ search, role, page });
  const totalPages = Math.ceil(total / 20);

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (role) params.set("role", role);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/staff${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <p className="text-sm -mt-4" style={{ color: "var(--admin-text-faint)" }}>
        {total} administrators
      </p>

      <div
        className="rounded-xl shadow-sm"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <StaffTable users={users} />

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

function StaffTableSkeleton() {
  return (
    <div
      className="rounded-xl shadow-sm p-4 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {Array.from({ length: 5 }).map((_, i) => (
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
            className="h-5 w-20 rounded animate-pulse"
            style={{ background: "var(--admin-hover-bg)" }}
          />
        </div>
      ))}
    </div>
  );
}

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const role = params.role ?? "";
  const page = Number(params.page ?? 1);

  const adminRoles = await getStaffAssignableRoles();

  const hasFilters = !!(search || role);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <UserCog size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="flex-1">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            <span style={{ color: "var(--admin-text-muted)" }}>Users</span>
            <span style={{ color: "var(--admin-text-faint)" }}> / </span>
            <span>Staff Management</span>
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Admin user management
          </p>
        </div>
        <AddStaffButton adminRoles={adminRoles} />
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
              placeholder="Search by name or email..."
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
            <option value="">All roles</option>
            {adminRoles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ background: "var(--admin-accent)" }}>
            Filter
          </button>

          {hasFilters && (
            <a
              href="/admin/staff"
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

      <Suspense fallback={<StaffTableSkeleton />}>
        <StaffContent search={search} role={role} page={page} />
      </Suspense>
    </div>
  );
}
