import { Suspense } from "react";
import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getUserPermissions } from "@/lib/rbac/can";
import {
  getAdminUserDashboardPref,
  getRolePresetsByNames,
} from "@/lib/admin/dashboard/queries";
import {
  getVisibleRegistry,
  resolveEnabledWidgetIds,
} from "@/lib/admin/dashboard/resolve";
import { DASHBOARD_WIDGETS_META } from "./_widgets/meta";
import { WIDGET_COMPONENTS } from "./_widgets/registry";
import DashboardCustomizeButton from "./_components/dashboard-customize-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.dashboard");
  return { title: t("metaTitle") };
}

export default async function AdminDashboardPage() {
  const user = await requireAdminPage();
  const t = await getTranslations("admin.dashboard");

  // Super admins bypass the per-widget RBAC gate; we don't need their
  // permission set at all in that case (one less DB query).
  const isSuperAdmin = user.isAdmin === true;
  const userPermissions = isSuperAdmin
    ? new Set<string>()
    : await getUserPermissions(user);

  // Multi-role union: today users have a single role string. The array
  // shape is here so multi-role can land later without changing this page.
  const roleNames = [user.role];

  const [userPref, rolePresets] = await Promise.all([
    getAdminUserDashboardPref(user.id),
    getRolePresetsByNames(roleNames),
  ]);

  const enabledIds = resolveEnabledWidgetIds({
    registry: DASHBOARD_WIDGETS_META,
    userPref,
    rolePresets,
    userPermissions,
    isSuperAdmin,
  });

  const visibleWidgets = getVisibleRegistry({
    registry: DASHBOARD_WIDGETS_META,
    userPermissions,
    isSuperAdmin,
  });

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={LayoutDashboard}
        breadcrumbLabel={t("breadcrumb")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        actionSlot={
          <DashboardCustomizeButton
            visibleWidgets={visibleWidgets}
            initialEnabled={enabledIds}
            hasUserOverride={userPref !== null}
          />
        }
      />

      {enabledIds.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-12 gap-3"
          style={{
            borderColor: "var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}
        >
          <LayoutDashboard size={28} style={{ opacity: 0.3 }} />
          <p className="text-sm">{t("emptyTitle")}</p>
          <p
            className="text-xs text-center max-w-xs"
            style={{ color: "var(--admin-text-faint)" }}
          >
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {enabledIds.map((id) => {
            const Component = WIDGET_COMPONENTS[id];
            if (!Component) return null;
            return (
              <Suspense key={id} fallback={<WidgetSkeleton />}>
                <Component />
              </Suspense>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        minHeight: "120px",
      }}
    >
      <div
        className="h-4 w-1/3 rounded"
        style={{ background: "var(--admin-hover-bg)" }}
      />
      <div
        className="h-3 w-2/3 rounded mt-3"
        style={{ background: "var(--admin-hover-bg)" }}
      />
    </div>
  );
}
