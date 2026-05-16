"use client";
// app/(admin)/admin/_components/admin-sticky-header.tsx
//
// Header sticky di una sezione admin con sub-tabs. DAL 2026-05-16:
// l'icona + titolo + descrizione sono spariti da qui — quei dati
// vengono ora mostrati nella topbar di AdminShellClient (che è già
// fissa in alto, sempre visibile). Qui restano SOLO le tabs.
//
// Le tabs si attaccano `top: 0` del <main> (che non ha padding di
// suo — il padding è sul wrapper interno in admin-shell-client),
// così lo sticky è pulito senza buchi o tweak. Il padding negativo
// orizzontale estende lo sfondo edge-to-edge sopra il padding del
// wrapper interno.
//
// API conservata per compat: il caller passa ancora icon/title/
// description, vengono accettati ma ignorati. Quando avremo tempo
// rimuoviamo i prop a cascata (sweep dei call site).
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "./admin-section-tabs";

export function AdminStickyHeader({
  tabs,
}: {
  /** @deprecated mostrato in topbar, ignorato qui. Solo per back-compat dei caller. */
  icon?: LucideIcon;
  /** @deprecated mostrato in topbar, ignorato qui. */
  title?: string;
  /** @deprecated mostrato in topbar, ignorato qui. */
  description?: string;
  /** @deprecated era usato per i tooltip info accanto al titolo. Da rivedere se servirà. */
  rightExtras?: ReactNode;
  tabs: AdminSectionTab[];
}) {
  return (
    <div
      className="sticky top-0 z-10 -mx-4 lg:-mx-2 px-4 lg:px-2"
      style={{ background: "var(--admin-page-bg)" }}>
      <AdminSectionTabs tabs={tabs} />
    </div>
  );
}
