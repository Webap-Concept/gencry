// app/(admin)/admin/security/layout.tsx
import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";
import { BlockedDomainsGuide } from "./blocked-domains/_components/blocked-domains-guide";
import { BlockedUsernamesGuide } from "./blocked-usernames/_components/blocked-usernames-guide";
import { IpRulesGuide } from "./ip-rules/_components/ip-rules-guide";

export default async function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:security");

  const [tNav, tSec, tMfa, tBf, tIp, tBd, tBu, tAdminUrl] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.security"),
    getTranslations("admin.security.mfa"),
    getTranslations("admin.security.bruteforce"),
    getTranslations("admin.security.ipRules"),
    getTranslations("admin.security.blockedDomains"),
    getTranslations("admin.security.blockedUsernames"),
    getTranslations("admin.security.adminUrl"),
  ]);

  const tabs = await getSectionTabs("security-group", (k) => tNav(k));

  const descriptions: Record<string, string> = {
    "admin-url": tAdminUrl("pageSubtitle"),
    mfa: tMfa("pageSubtitle"),
    bruteforce: tBf("pageSubtitle"),
    "ip-rules": tIp("pageSubtitle"),
    "blocked-domains": tBd("pageSubtitle"),
    "blocked-usernames": tBu("pageSubtitle"),
  };

  const iconBySegment: Record<string, string> = {
    "admin-url": "Link2",
    mfa: "ShieldCheck",
    bruteforce: "ShieldBan",
    "ip-rules": "ListFilter",
    "blocked-domains": "Globe",
    "blocked-usernames": "UserX",
  };

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    "ip-rules": {
      title: tIp("guideTitle"),
      ariaLabel: tIp("guideAriaLabel"),
      content: <IpRulesGuide />,
    },
    "blocked-domains": {
      title: tBd("guideTitle"),
      ariaLabel: tBd("guideAriaLabel"),
      content: <BlockedDomainsGuide />,
    },
    "blocked-usernames": {
      title: tBu("guideTitle"),
      ariaLabel: tBu("guideAriaLabel"),
      content: <BlockedUsernamesGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader
        title={tNav("security-group")}
        defaultDescription={tNav("descriptions.security-group")}
        defaultIcon="Lock"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        guides={guides}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
