import { db } from "@/lib/db/drizzle";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { rolePermissions } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/rbac/guards";
import {
  getAllPermissions,
  getSystemPermissionsDrift,
} from "@/lib/rbac/permissions-queries";
import { SYSTEM_PERMISSIONS } from "@/lib/rbac/system-permissions";
import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PermissionsInfoCard } from "./_components/permissions-info-card";
import { PermissionsManager } from "./_components/permissions-manager";

export const metadata: Metadata = { title: "Users / Permissions" };

async function PermissionsContent() {
  const [allPermissions, roles, matrix, drift] = await Promise.all([
    getAllPermissions(),
    getAdminRoles(),
    db
      .select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions),
    getSystemPermissionsDrift(),
  ]);

  const systemKeys = SYSTEM_PERMISSIONS.map((p) => ({
    key: p.key,
    description: p.description,
    group: p.group,
  }));

  return (
    <PermissionsManager
      permissions={allPermissions}
      roles={roles}
      rolePermissions={matrix}
      systemKeys={systemKeys}
      drift={drift}
    />
  );
}

export default async function AdminPermissionsPage() {
  await requireAdminPage();

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
          <KeyRound size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            <span style={{ color: "var(--admin-text-muted)" }}>Users</span>
            <span style={{ color: "var(--admin-text-faint)" }}> / </span>
            <span>Permissions</span>
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Manage the permission catalog and the role → permission matrix.
          </p>
        </div>
      </div>

      <PermissionsInfoCard />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: "var(--admin-accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        }>
        <PermissionsContent />
      </Suspense>
    </div>
  );
}
