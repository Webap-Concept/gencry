"use client";
import { AdminStickyHeader } from "@/app/(admin)/admin/_components/admin-sticky-header";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

export function RewardsHeaderClient({ tabs }: { tabs: AdminSectionTab[] }) {
  return <AdminStickyHeader tabs={tabs} />;
}
