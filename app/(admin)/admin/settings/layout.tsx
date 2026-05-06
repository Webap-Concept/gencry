import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

// L'header è ora gestito da ogni page.tsx via AdminSectionHeader (vedi
// project_admin_section_headers.md): pattern unico per tutto il core,
// niente più dispatch by pathname. Il layout fornisce solo il guard
// RBAC e lo stacking spacing.
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:settings");
  return <div className="space-y-5">{children}</div>;
}
