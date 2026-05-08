import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function ContentStylesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:content");
  return <>{children}</>;
}
