// app/(admin)/admin/security/ip-rules/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { requireAdminPage } from "@/lib/rbac/guards";
import { ListFilter } from "lucide-react";
import { Suspense } from "react";
import { IpRulesClient } from "./_components/ip-rules-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.ipRules");
  return { title: t("metaTitle") };
}

export default async function AdminIpRulesPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.security");
  const tIp = await getTranslations("admin.security.ipRules");

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ListFilter}
        breadcrumbLabel={t("breadcrumb")}
        title={tIp("pageTitle")}
        subtitle={tIp("pageSubtitle")}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
            />
          </div>
        }
      >
        <IpRulesClient />
      </Suspense>
    </div>
  );
}
