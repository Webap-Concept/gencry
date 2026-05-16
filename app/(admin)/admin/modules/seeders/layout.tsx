import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Seeders" };

// Seeders è single-page (no sub-tabs). Icona + titolo sono ora nella
// topbar admin (vedi lib/admin/current-section.ts).
export default async function SeedersModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:seeders");
  return <div className="space-y-5">{children}</div>;
}
