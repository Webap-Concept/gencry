import { Suspense, type ReactNode } from "react";
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
  resolveDashboardLayout,
} from "@/lib/admin/dashboard/resolve";
import { DASHBOARD_WIDGETS_META } from "./_widgets/meta";
import { WIDGET_COMPONENTS } from "./_widgets/registry";
import DashboardToolbar from "./_components/dashboard-toolbar";
import { DashboardEditModeProvider } from "./_components/dashboard-edit-mode-context";
import DashboardGridSwitcher from "./_components/dashboard-grid-switcher";
import WidgetIsolator from "./_components/widget-isolator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.dashboard");
  return { title: t("metaTitle") };
}

export default async function AdminDashboardPage() {
  const user = await requireAdminPage();
  const t = await getTranslations("admin.dashboard");

  const isSuperAdmin = user.isAdmin === true;
  const userPermissions = isSuperAdmin
    ? new Set<string>()
    : await getUserPermissions(user);

  const roleNames = [user.role];
  const [userPref, rolePresets] = await Promise.all([
    getAdminUserDashboardPref(user.id),
    getRolePresetsByNames(roleNames),
  ]);

  const items = resolveDashboardLayout({
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

  // Pre-render every widget RSC body once so the client grid can place
  // them by id without re-running the server fetches when toggling
  // edit mode. This works because Server Components can be passed as
  // children/props of Client Components in the React 19 model.
  //
  // Each widget is wrapped in TWO independent boundaries:
  //   - <WidgetIsolator>: catches throws inside the widget RSC (DB
  //     timeout, third-party API, malformed data) and renders an inline
  //     error state without ever bringing down the rest of the dashboard.
  //   - <Suspense>: lets the page stream — the fast widgets paint as
  //     soon as their data lands, the slow ones show a skeleton until
  //     they're ready instead of holding back the whole response.
  const errorLabel = t("widgetError");
  const widgetsById: Record<string, ReactNode> = {};
  for (const it of items) {
    const Component = WIDGET_COMPONENTS[it.id];
    if (!Component) continue;
    widgetsById[it.id] = (
      <WidgetIsolator fallbackLabel={errorLabel}>
        <Suspense fallback={<WidgetSkeleton />}>
          <Component />
        </Suspense>
      </WidgetIsolator>
    );
  }

  return (
    <DashboardEditModeProvider initialItems={items}>
      <div className="space-y-5">
        <AdminSectionHeader
          icon={LayoutDashboard}
          breadcrumbLabel={t("breadcrumb")}
          title={t("pageTitle")}
          subtitle={t("pageSubtitle")}
          actionSlot={
            <DashboardToolbar
              visibleWidgets={visibleWidgets}
              initialEnabled={items.map((it) => it.id)}
              hasUserOverride={userPref !== null}
            />
          }
        />

        {items.length === 0 ? (
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
          <DashboardGridSwitcher widgetsById={widgetsById} />
        )}
      </div>
    </DashboardEditModeProvider>
  );
}

// Card chrome (bg/border/radius) is owned by the grid cell wrapper
// (see admin.css → .dashboard-widget-cell). The skeleton only paints
// inner placeholders inside the already-styled cell.
function WidgetSkeleton() {
  return (
    <div className="h-full p-5 animate-pulse">
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
