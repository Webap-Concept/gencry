import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:gdpr");
  return <>{children}</>;
}
