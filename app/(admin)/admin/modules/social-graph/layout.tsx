import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Social Graph" };

export default async function SocialGraphLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:social-graph");
  return <div className="space-y-5">{children}</div>;
}
