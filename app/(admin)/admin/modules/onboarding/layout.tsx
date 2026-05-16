import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Onboarding" };

// Onboarding è single-page (no sub-tabs). Niente header sezione qui:
// icona + titolo sono mostrati dalla topbar admin (vedi
// lib/admin/current-section.ts).
export default async function OnboardingModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:onboarding");
  return <div className="space-y-5">{children}</div>;
}
