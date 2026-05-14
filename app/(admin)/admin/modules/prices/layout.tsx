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
    <div className="space-y-5">
      <PricesHeader adminSlug={slug} />
      {children}
    </div>
  );
}
