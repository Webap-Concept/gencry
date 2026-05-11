import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { OnboardingHeader } from "./_components/onboarding-header";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:onboarding");
  return (
    <div className="space-y-5">
      <OnboardingHeader />
      {children}
    </div>
  );
}
