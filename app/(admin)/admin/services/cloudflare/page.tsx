import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Shield } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CloudflareForm } from "./_components/cloudflare-form";

export const metadata: Metadata = { title: "Services / Cloudflare" };

export default async function ServicesCloudflarePage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Shield}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.cloudflare.label")}
        subtitle={t("sections.cloudflare.description")}
      />
      <CloudflareForm settings={settings} />
    </>
  );
}
