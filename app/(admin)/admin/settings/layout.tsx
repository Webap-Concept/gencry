import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { SignupFlowDiagram } from "./signup/_components/signup-flow-diagram";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:settings");

  const [tNav, tCron, tSignupFlow] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.cron"),
    getTranslations("admin.settings.signup.flowDiagram"),
  ]);

  const tabs = await getSectionTabs("settings-group", (k) => tNav(k));

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    cron: {
      title: tCron("guideTitle"),
      ariaLabel: tCron("guideTriggerAria"),
      content: <CronAdminGuide />,
    },
    signup: {
      title: tSignupFlow("modalTitle"),
      ariaLabel: tSignupFlow("trigger"),
      content: <SignupFlowDiagram />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader tabs={tabs} guides={guides} />
      {children}
    </div>
  );
}
