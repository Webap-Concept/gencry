import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function AdminUrlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:security");
  return <>{children}</>;
}
