import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { RewardsHeader } from "./_components/rewards-header";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:rewards");
  return (
    <div className="space-y-5">
      <RewardsHeader />
      {children}
    </div>
  );
}
