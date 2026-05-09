import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function ContentStylesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Custom CSS impatta TUTTE le pagine CMS: serve un permesso ad alto
  // privilegio, separato da content:create.
  await requireAdminSectionPage("content:styles");
  return <>{children}</>;
}
