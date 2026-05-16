"use client";
// app/(admin)/admin/_components/admin-sticky-header.tsx
//
// Sticky tab-bar di una sezione admin. Icon + titolo della sezione
// vivono nella topbar di AdminShellClient (vedi lib/admin/current-section.ts),
// qui restano solo le sub-tabs + un opzionale info-button "i" per la
// guida della sub-section corrente.
//
// Sticky semplice (top:0): si attacca al top del <main> (che non ha
// padding di suo — il padding sta sul wrapper interno in
// admin-shell-client). I `-mx` estendono lo sfondo edge-to-edge sopra
// il padding orizzontale del wrapper.
import { AdminSectionInfo } from "./section-info";
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "./admin-section-tabs";
import type { ReactNode } from "react";

export type AdminStickyHeaderGuide = {
  title: string;
  ariaLabel: string;
  content: ReactNode;
};

export function AdminStickyHeader({
  tabs,
  guide,
}: {
  tabs: AdminSectionTab[];
  /** Bottone info-tooltip mostrato a destra delle tabs per la
   *  sub-section corrente. Opzionale. */
  guide?: AdminStickyHeaderGuide;
}) {
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
