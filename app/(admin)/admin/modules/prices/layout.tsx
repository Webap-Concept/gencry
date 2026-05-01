import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { PricesHeader } from "./_components/prices-header";

export const metadata: Metadata = { title: "Prices Engine" };

export default async function PricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:prices");
  return (
    <div className="space-y-5">
      <PricesHeader />
      {children}
    </div>
  );
}
