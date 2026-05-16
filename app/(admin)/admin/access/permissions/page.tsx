import { db } from "@/lib/db/drizzle";
import { getAllSystemPermissions } from "@/lib/db/permissions-data";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { rolePermissions } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/rbac/guards";
import {
  getAllPermissions,
  getSystemPermissionsDrift,
} from "@/lib/rbac/permissions-queries";
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
  const [allPermissions, roles, matrix, drift, tLabel, tDesc] =
    await Promise.all([
      getAllPermissions(),
      getAdminRoles(),
      db
        .select({
          roleId: rolePermissions.roleId,
          permissionId: rolePermissions.permissionId,
        })
        .from(rolePermissions),
      getSystemPermissionsDrift(),
      getTranslations("admin.access.permissions.permissionLabels"),
      getTranslations("admin.access.permissions.permissionDescriptions"),
    ]);

  // Source of truth dei permessi system = permissions-data.ts (lo stesso
  // file che alimenta seed e "Sync system permissions"). Per ognuno la UI
  // mostra label e description tradotti dai messages i18n; i fallback
  // (label dal codice, description dal DB) coprono i custom permissions e
  // i casi in cui manca la traduzione per la chiave.
  const systemPerms = getAllSystemPermissions();
  const systemKeySet = new Set(systemPerms.map((p) => p.key));
  const translateLabel = (key: string, fallback: string) =>
    tLabel.has(key) ? tLabel(key) : fallback;
  const translateDescription = (key: string, fallback: string | null) =>
    tDesc.has(key) ? tDesc(key) : (fallback ?? "");

  const systemKeys = systemPerms.map((p) => ({
    key: p.key,
    description: translateDescription(p.key, null),
    group: p.group,
  }));

  const translatedPermissions = allPermissions.map((p) =>
    systemKeySet.has(p.key)
      ? {
          ...p,
          label: translateLabel(p.key, p.label),
          description: translateDescription(p.key, p.description),
        }
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

  return (
    <div className="space-y-5">
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
