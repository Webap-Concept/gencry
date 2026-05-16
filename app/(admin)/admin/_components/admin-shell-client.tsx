"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { useState } from "react";
import MobileMenuButton from "./mobile-menu-button";
import AdminSidebar from "./sidebar";

type AdminShellClientProps = {
  children: React.ReactNode;
  header: React.ReactNode;
  appName: string;
  /** Array serializzato dei permessi attivi — generato dal layout server */
  userPermissions: string[];
  /** true se l'utente è super admin (isAdmin flag) — bypassa tutti i filtri */
  isSuperAdmin: boolean;
  /** Override globale dell'ordinamento top-level (vedi admin_nav_order) */
  navOrder: Record<string, number>;
};

export default function AdminShellClient({
  children,
  header,
  appName,
  userPermissions,
  isSuperAdmin,
  navOrder,
}: AdminShellClientProps) {
  const t = useTranslations("admin.shell");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const permissionsSet = new Set(userPermissions);

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <div
        className="flex h-screen overflow-hidden"
        style={{ background: "var(--admin-page-bg)" }}>
        <AdminSidebar
          appName={appName}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userPermissions={permissionsSet}
          isSuperAdmin={isSuperAdmin}
          navOrder={navOrder}
        />

        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div
            className="flex items-center justify-between px-4 lg:px-6 shrink-0"
            style={{
              height: "var(--admin-header-height)",
              background: "var(--admin-header-bg)",
              borderBottom: "1px solid var(--admin-header-border)",
            }}>
            <div className="flex items-center gap-3">
              <MobileMenuButton onClick={() => setSidebarOpen(true)} />
              <h1
                className="text-sm font-semibold hidden lg:block"
                style={{ color: "var(--admin-header-text)" }}>
                {t("dashboardTitle")}
              </h1>
              <h1
                className="text-sm font-semibold lg:hidden"
                style={{ color: "var(--admin-header-text)" }}>
                {t("dashboardTitleShort")}
              </h1>
            </div>
            {header}
          </div>

          <main className="flex-1 overflow-y-auto p-4 lg:p-2">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
