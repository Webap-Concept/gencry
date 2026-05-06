import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Database } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RedisAdminGuide } from "./_components/redis-guide";
import { RedisForm } from "./_components/redis-form";

export const metadata: Metadata = { title: "Services / Redis" };

export default async function ServicesRedisPage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Database}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.redis.label")}
        subtitle={t("sections.redis.description")}
        infoSlot={
          <AdminSectionInfo
            title={t("sections.redis.guideTitle")}
            ariaLabel={`${t("guideAriaPrefix")} ${t("sections.redis.label")}`}>
            <RedisAdminGuide />
          </AdminSectionInfo>
        }
      />
      <RedisForm settings={settings} />
    </>
  );
}
