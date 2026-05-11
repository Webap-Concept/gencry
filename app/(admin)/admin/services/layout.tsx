import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Services" };

// Header gestito da ogni page.tsx via AdminSectionHeader (vedi
// project_admin_section_headers.md).
export default async function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:services");
  return <div className="space-y-5">{children}</div>;
}
