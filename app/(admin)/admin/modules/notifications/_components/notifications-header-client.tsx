"use client";
// Client component delle tabs Notifications. Riceve tabs già pronte
// dal server e si occupa solo dell'active state via AdminStickyHeader.
// Nessuna guide info-button per ora (nessun segment ha bisogno di una
// docs-area pop-up).
import { AdminStickyHeader } from "@/app/(admin)/admin/_components/admin-sticky-header";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

export function NotificationsHeaderClient({
  tabs,
}: {
  tabs: AdminSectionTab[];
}) {
  return <AdminStickyHeader tabs={tabs} />;
}
