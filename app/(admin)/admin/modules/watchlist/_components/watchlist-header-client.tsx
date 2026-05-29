"use client";
// Client component delle tabs del modulo watchlist. Riceve le tabs gia'
// filtrate per RBAC dal server (vedi watchlist-header.tsx).
import { AdminStickyHeader } from "@/app/(admin)/admin/_components/admin-sticky-header";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

export function WatchlistHeaderClient({ tabs }: { tabs: AdminSectionTab[] }) {
  return <AdminStickyHeader tabs={tabs} />;
}
