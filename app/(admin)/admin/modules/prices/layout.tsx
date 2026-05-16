import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import type { Metadata } from "next";
import { PricesHeader } from "./_components/prices-header";

export const metadata: Metadata = { title: "Prices Engine" };

export default async function PricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:prices");
  const slug = await getAdminUrlSlug();
  return (
    // PricesHeader fuori dal `space-y-5`: in un wrapper space-y il
    // 2° child (header) riceverebbe margin-top, creando un buco di
    // 20px sopra l'header sticky. Lo `mt-5` sul wrapper interno
    // sostituisce esattamente quello space tra header e content.
    <>
      <PricesHeader adminSlug={slug} />
      <div className="space-y-5 mt-5">{children}</div>
    </>
  );
}
