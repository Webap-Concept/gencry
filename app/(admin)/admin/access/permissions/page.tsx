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
  const [allPermissions, roles, matrix, drift, tDesc] = await Promise.all([
    getAllPermissions(),
    getAdminRoles(),
    db
      .select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions),
    getSystemPermissionsDrift(),
    getTranslations("admin.access.permissions.permissionDescriptions"),
  ]);

  // Per i permessi di sistema preferiamo la description dalla i18n: il
  // seed/DB tiene una versione IT come fallback, ma la UI deve seguire la
  // lingua dell'utente. Per i custom permissions creati dall'admin
  // manteniamo la description del DB (può essere in qualunque lingua).
  const translateDescription = (key: string, fallback: string | null) =>
    tDesc.has(key) ? tDesc(key) : (fallback ?? "");

  const systemKeys = SYSTEM_PERMISSIONS.map((p) => ({
    key: p.key,
    description: translateDescription(p.key, p.description),
    group: p.group,
  }));

  const systemKeySet = new Set(SYSTEM_PERMISSIONS.map((p) => p.key));
  const translatedPermissions = allPermissions.map((p) =>
    systemKeySet.has(p.key)
      ? { ...p, description: translateDescription(p.key, p.description) }
      : p,
  );

  return (
    <PermissionsManager
      permissions={translatedPermissions}
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
