import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";
import { CookiesAdminGuide } from "./cookies/_components/cookies-admin-guide";
import { GdprLegendGuide } from "./gdpr/_components/gdpr-legend-guide";

export default async function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:gdpr");

  const [tNav, tGdpr, tCookies] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.compliance.gdpr"),
    getTranslations("admin.compliance.cookies"),
  ]);

  const tabs = await getSectionTabs("compliance-group", (k) => tNav(k));

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    gdpr: {
      title: tGdpr("guideTitle"),
      ariaLabel: tGdpr("guideAriaLabel"),
      content: <GdprLegendGuide />,
    },
    cookies: {
      title: tCookies("guideTitle"),
      ariaLabel: tCookies("guideAriaLabel"),
      content: <CookiesAdminGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader tabs={tabs} guides={guides} />
      {children}
    </div>
  );
}
