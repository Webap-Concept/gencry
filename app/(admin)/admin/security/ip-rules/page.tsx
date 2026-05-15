// app/(admin)/admin/security/ip-rules/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/rbac/guards";
import { IpRulesClient } from "./_components/ip-rules-client";
import { getIpRulesData } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.ipRules");
  return { title: t("metaTitle") };
}

export default async function AdminIpRulesPage() {
  await requireAdminPage();
  const data = await getIpRulesData();

  return (
    <IpRulesClient
      initialRules={data.rules}
      lockdownEnabled={data.lockdownEnabled}
      currentIp={data.currentIp}
      currentIpAdminDecision={data.currentIpAdminDecision}
    />
  );
}
