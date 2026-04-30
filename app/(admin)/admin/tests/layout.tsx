import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function TestsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSectionPage("admin:tests");
  return <>{children}</>;
}
