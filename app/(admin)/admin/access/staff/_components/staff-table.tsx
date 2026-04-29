"use client";

import { getAdminPath } from "@/lib/admin-nav";
import type { AdminUser } from "@/lib/db/admin-queries";
import Link from "next/link";

function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: color + "18",
        color,
        border: `1px solid ${color}40`,
      }}>
      {label}
    </span>
  );
}

function StaffRow({ user }: { user: AdminUser }) {
  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || user.email[0].toUpperCase();

  const roleColor = user.roleColor ?? "#6b7280";
  const roleLabel = user.roleLabel ?? user.role;

  return (
    <tr
      className="transition-colors"
      style={{ borderBottom: "1px solid var(--admin-divider)" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--admin-hover-bg)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {/* Avatar + clickable name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-8 h-8 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: roleColor }}>
              {initials}
            </div>
          )}
          <div>
            <Link
              href={`${getAdminPath("users-list")}/${user.id}`}
              className="text-sm font-medium transition-colors leading-none admin-user-link"
              style={{ color: "var(--admin-text)" }}>
              {user.firstName} {user.lastName}
            </Link>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {user.email}
            </p>
          </div>
        </div>
      </td>

      {/* Role — read-only badge */}
      <td className="px-4 py-3">
        <RoleBadge label={roleLabel} color={roleColor} />
      </td>

      {/* Verified Email */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span
          className={`text-[11px] font-medium ${
            user.emailVerified ? "text-emerald-600" : ""
          }`}
          style={
            !user.emailVerified ? { color: "var(--admin-text-faint)" } : {}
          }>
          {user.emailVerified ? "✓ Verified" : "Not verified"}
        </span>
      </td>

      {/* Date Added */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {new Date(user.createdAt).toLocaleDateString("en-US")}
        </span>
      </td>
    </tr>
  );
}

export default function StaffTable({ users }: { users: AdminUser[] }) {
  if (users.length === 0) {
    return (
      <div
        className="text-center py-16 text-sm"
        style={{ color: "var(--admin-text-faint)" }}>
        No staff members found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--admin-divider)" }}>
            {["Member", "Role", "Email", "Added on"].map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${
                  i >= 2 ? "hidden lg:table-cell" : ""
                }`}
                style={{ color: "var(--admin-text-faint)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <StaffRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
