"use client";
// app/(admin)/admin/_components/admin-parent-header.tsx
//
// Header generico per le parent section del core admin (settings,
// access, security, content, compliance, seo, services).
//
// DAL 2026-05-16: l'icona + titolo + descrizione + guida-tooltip
// sono spariti da qui — quei dati sono ora mostrati nella topbar
// di AdminShellClient (vedi lib/admin/current-section.ts). Qui
// restano SOLO le sub-tabs sticky.
//
// API conservata per compat: il caller passa ancora title/icon/
// descriptions/guides, vengono accettati ma ignorati. Quando avremo
// tempo rimuoviamo i prop a cascata dai 7 layout core che li
// passano.
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "@/app/(admin)/admin/_components/admin-section-tabs";
import type { ReactNode } from "react";

export type ParentHeaderGuide = {
  title: string;
  ariaLabel: string;
  content: ReactNode;
};

export type AdminParentHeaderProps = {
  /** @deprecated mostrato in topbar, ignorato qui. */
  title?: string;
  /** @deprecated mostrato in topbar, ignorato qui. */
  defaultDescription?: string;
  /** @deprecated mostrato in topbar, ignorato qui. */
  defaultIcon?: string;
  /** @deprecated mostrato in topbar, ignorato qui. */
  iconBySegment?: Record<string, string>;
  /** @deprecated mostrato in topbar, ignorato qui. */
  descriptions?: Record<string, string>;
  /** @deprecated da rivedere se servirà come tooltip in topbar. */
  guides?: Partial<Record<string, ParentHeaderGuide>>;
  tabs: AdminSectionTab[];
};

export function AdminParentHeader({ tabs }: AdminParentHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 -mx-4 lg:-mx-2 px-4 lg:px-2"
      style={{ background: "var(--admin-page-bg)" }}>
      <AdminSectionTabs tabs={tabs} />
    </div>
  );
}
