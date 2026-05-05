import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { ServicesHeader } from "./_components/services-header";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:settings");
  return (
    <div className="space-y-5">
      <ServicesHeader />
      {children}
    </div>
  );
}
