import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:sessions");
  return <>{children}</>;
}
