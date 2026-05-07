import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function MfaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:security");
  return <>{children}</>;
}
