import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { SocialGraphHeader } from "./_components/social-graph-header";

export const metadata: Metadata = { title: "Social Graph" };

export default async function SocialGraphLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:social-graph");
  return (
    <div className="space-y-5">
      <SocialGraphHeader />
      {children}
    </div>
  );
}
