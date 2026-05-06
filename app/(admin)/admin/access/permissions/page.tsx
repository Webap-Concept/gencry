import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
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
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PermissionsInfoCard } from "./_components/permissions-info-card";
import { PermissionsManager } from "./_components/permissions-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.access.permissions");
  return { title: t("metaTitle") };
}

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
  const t = await getTranslations("admin.access.permissions");

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={KeyRound}
        breadcrumbLabel={t("breadcrumbUsers")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

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
