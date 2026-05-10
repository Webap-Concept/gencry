// app/(admin)/admin/security/blocked-domains/page.tsx
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { db } from "@/lib/db/drizzle";
import { disposableDomains } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/rbac/guards";
import { asc } from "drizzle-orm";
import { Globe } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BlockedDomainsClient } from "./_components/blocked-domains-client";
import { BlockedDomainsGuide } from "./_components/blocked-domains-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.blockedDomains");
  return { title: t("metaTitle") };
}

async function BlockedDomainsContent() {
  const dbDomains = await db
    .select({ domain: disposableDomains.domain })
    .from(disposableDomains)
    .orderBy(asc(disposableDomains.domain));
  return (
    <BlockedDomainsClient initialDomains={dbDomains.map((r) => r.domain)} />
  );
}

export default async function AdminBlockedDomainsPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.security");
  const tBd = await getTranslations("admin.security.blockedDomains");

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Globe}
        breadcrumbLabel={t("breadcrumb")}
        title={tBd("pageTitle")}
        subtitle={tBd("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={tBd("guideTitle")}
            ariaLabel={tBd("guideAriaLabel")}>
            <BlockedDomainsGuide />
          </AdminSectionInfo>
        }
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: "var(--admin-accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        }>
        <BlockedDomainsContent />
      </Suspense>
    </div>
  );
}
