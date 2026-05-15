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

  const [tNav, tSettings, tCron, tSignupFlow] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.settings"),
    getTranslations("admin.cron"),
    getTranslations("admin.settings.signup.flowDiagram"),
  ]);

  const tabs = await getSectionTabs("settings-group", (k) => tNav(k));

  const segments = [
    "general",
    "operation-mode",
    "signup",
    "email",
    "snippets",
    "notifications",
    "languages",
    "cron",
  ] as const;

  const descriptions: Record<string, string> = Object.fromEntries(
    segments.map((s) => [s, tSettings(`sections.${s}.description`)]),
  );

  const iconBySegment: Record<string, string> = {
    general: "Settings",
    "operation-mode": "SlidersHorizontal",
    signup: "LogIn",
    email: "MailOpen",
    snippets: "Code2",
    notifications: "Bell",
    languages: "Languages",
    cron: "Clock",
  };

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
      <AdminParentHeader
        title={tNav("settings-group")}
        defaultDescription={tNav("descriptions.settings-group")}
        defaultIcon="Settings"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        guides={guides}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
