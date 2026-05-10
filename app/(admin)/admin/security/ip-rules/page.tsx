// app/(admin)/admin/security/ip-rules/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { requireAdminPage } from "@/lib/rbac/guards";
import { ListFilter } from "lucide-react";
import { IpRulesClient } from "./_components/ip-rules-client";
import { getIpRulesData } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.ipRules");
  return { title: t("metaTitle") };
}

export default async function AdminIpRulesPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.security");
  const tIp = await getTranslations("admin.security.ipRules");

  const data = await getIpRulesData();

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ListFilter}
        breadcrumbLabel={t("breadcrumb")}
        title={tIp("pageTitle")}
        subtitle={tIp("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={tIp("guideTitle")}
            ariaLabel={tIp("guideAriaLabel")}>
            <p>{tIp("guideIntro")}</p>
            <ul>
              <li>{tIp("guideBulletAuth")}</li>
              <li>{tIp("guideBulletAdmin")}</li>
              <li>{tIp("guideBulletAllow")}</li>
              <li>{tIp("guideBulletCidr")}</li>
              <li>{tIp("guideBulletLockdown")}</li>
              <li>{tIp("guideBulletPerf")}</li>
            </ul>
            <p>{tIp("guidePerfNote")}</p>
          </AdminSectionInfo>
        }
      />

      <IpRulesClient
        initialRules={data.rules}
        lockdownEnabled={data.lockdownEnabled}
        currentIp={data.currentIp}
        currentIpAdminDecision={data.currentIpAdminDecision}
      />
    </div>
  );
}
