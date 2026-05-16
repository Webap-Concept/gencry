"use client";
// app/(admin)/admin/_components/admin-parent-header.tsx
//
// Sticky tab-bar per le parent section del core admin (settings,
// access, security, content, compliance, seo, services).
//
// Icon + titolo della sezione vivono nella topbar di AdminShellClient.
// Qui restano solo le sub-tabs + un opzionale info-button "i" per la
// guida del segment corrente (lookup `guides[segment]`).
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "@/app/(admin)/admin/_components/admin-section-tabs";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type ParentHeaderGuide = {
  title: string;
  ariaLabel: string;
  content: ReactNode;
};

export type AdminParentHeaderProps = {
  tabs: AdminSectionTab[];
  /** Map segment → guide. La guide del segment corrente viene mostrata
   *  a destra delle tabs come bottone "i". */
  guides?: Partial<Record<string, ParentHeaderGuide>>;
};

export function AdminParentHeader({
  tabs,
  guides = {},
}: AdminParentHeaderProps) {
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const guide = guides[segment];

  return (
    <div
      className="sticky top-0 z-10 -mx-4 lg:-mx-2 px-4 lg:px-2 flex items-end gap-3"
      style={{ background: "var(--admin-page-bg)" }}>
      <div className="flex-1 min-w-0">
        <AdminSectionTabs tabs={tabs} />
      </div>
      {guide ? (
        // Hidden su mobile: lo spazio orizzontale serve tutto alle
        // tabs scrollabili, e l'info-button rubando il fianco
        // costringerebbe a far overflow le tabs ancora prima.
        <div className="hidden sm:flex pb-2 shrink-0">
          <AdminSectionInfo
            title={guide.title}
            ariaLabel={guide.ariaLabel}
            size="md">
            {guide.content}
          </AdminSectionInfo>
        </div>
      ) : null}
    </div>
  );
}
