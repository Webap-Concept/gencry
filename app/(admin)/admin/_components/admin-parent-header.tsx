"use client";
// app/(admin)/admin/_components/admin-parent-header.tsx
//
// Header generico per le parent section del core admin: titolo parent
// costante + descrizione/icona/guida che cambiano in base al route segment
// + tab di navigazione fra i child accessibili (da `<AdminSectionTabs>`).
//
// Pattern unificato dal 2026-05-14 (vedi project_admin_section_headers).
// Sostituisce i 3 pattern legacy (per-page AdminSectionHeader, dispatch
// header locale, inline JSX).
//
// Le icone arrivano come STRINGHE (lookup in NAV_ICON_MAP): le funzioni
// Lucide non sono serializzabili attraverso il boundary server→client,
// quindi è importante che il dispatch viva qui dentro.
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "@/app/(admin)/admin/_components/admin-section-tabs";
import { getNavIcon } from "@/lib/admin/nav/icon-map";
import { Layers } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type ParentHeaderGuide = {
  title: string;
  ariaLabel: string;
  content: ReactNode;
};

export type AdminParentHeaderProps = {
  /** Titolo costante del parent (es. "Contenuti", "Sicurezza"). */
  title: string;
  /** Descrizione mostrata quando il segment corrente non ha una entry. */
  defaultDescription: string;
  /** Icona del parent quando il segment non ha override. Nome Lucide
   *  (es. "Layers"). Default: Layers. */
  defaultIcon?: string;
  /** segment → nome icona (lookup in NAV_ICON_MAP). */
  iconBySegment?: Record<string, string>;
  /** segment → descrizione (stringa già localizzata dal server). */
  descriptions: Record<string, string>;
  /** segment → guide JSX (server-rendered, passato come prop). */
  guides?: Partial<Record<string, ParentHeaderGuide>>;
  tabs: AdminSectionTab[];
};

export function AdminParentHeader({
  title,
  defaultDescription,
  defaultIcon,
  iconBySegment = {},
  descriptions,
  guides = {},
  tabs,
}: AdminParentHeaderProps) {
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const iconName = iconBySegment[segment] ?? defaultIcon;
  const Icon = iconName ? getNavIcon(iconName) : Layers;
  const description = descriptions[segment] ?? defaultDescription;
  const guide = guides[segment];

  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Icon size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--admin-text)" }}>
              {title}
            </h2>
            {guide && (
              <AdminSectionInfo title={guide.title} ariaLabel={guide.ariaLabel}>
                {guide.content}
              </AdminSectionInfo>
            )}
          </div>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {description}
          </p>
        </div>
      </div>
      <AdminSectionTabs tabs={tabs} />
    </header>
  );
}
