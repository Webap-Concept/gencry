import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Templates è una sezione "strutturale": un blogger con content:create
  // non deve poter creare/modificare/eliminare templates né assegnarli a
  // pagine. Permesso dedicato content:templates richiesto.
  await requireAdminSectionPage("content:templates");
  return <>{children}</>;
}
