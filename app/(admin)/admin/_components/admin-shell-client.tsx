"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getAdminCurrentSection } from "@/lib/admin/current-section";
import { getNavIcon } from "@/lib/admin/nav/icon-map";
import MobileMenuButton from "./mobile-menu-button";
import AdminSidebar from "./sidebar";
import { useAdminSlug } from "./admin-slug-context";

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
  const tNav = useTranslations("admin.nav");
  const pathname = usePathname() ?? "";
  const adminSlug = useAdminSlug();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const permissionsSet = new Set(userPermissions);

  // Topbar dinamica: invece di "Pannello Admin" mostriamo l'icona + il
  // titolo della sezione admin corrente, dedotti dal pathname. Le
  // sezioni core usano una nav key i18n esistente, i moduli un label
  // diretto dal manifest. Fallback al titolo statico se l'URL non
  // matcha (es. pagine fuori sezione, modal, ecc).
  const currentSection = getAdminCurrentSection(pathname, adminSlug);
  const SectionIcon = currentSection ? getNavIcon(currentSection.iconName) : null;
  const sectionTitle = currentSection
    ? currentSection.label ??
      (currentSection.navKey ? tNav(currentSection.navKey) : null)
    : null;

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
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <MobileMenuButton onClick={() => setSidebarOpen(true)} />
              {SectionIcon && sectionTitle ? (
                <>
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background:
                        "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                      color: "var(--admin-accent)",
                    }}>
                    <SectionIcon size={18} />
                  </span>
                  <h1
                    className="text-xs sm:text-lg font-semibold truncate"
                    style={{ color: "var(--admin-header-text)" }}>
                    {sectionTitle}
                  </h1>
                </>
              ) : (
                <>
                  <h1
                    className="text-xs sm:text-lg font-semibold hidden lg:block truncate"
                    style={{ color: "var(--admin-header-text)" }}>
                    {t("dashboardTitle")}
                  </h1>
                  <h1
                    className="text-xs sm:text-lg font-semibold lg:hidden truncate"
                    style={{ color: "var(--admin-header-text)" }}>
                    {t("dashboardTitleShort")}
                  </h1>
                </>
              )}
            </div>
            {header}
          </div>

          {/* <main> è il scroll container ma NON ha padding di suo:
              così uno sticky `top: 0` dentro un suo discendente si
              attacca pulito al top edge del main, senza padding-top
              fantasma che riemerge come "buco bianco" sopra l'header
              durante lo scroll.
              Il padding lo eredita ogni pagina via questo wrapper
              interno — i layout sezione possono ancora estendersi
              edge-to-edge con `-mx-4 lg:-mx-2`, come fa AdminStickyHeader. */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 lg:p-2">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
