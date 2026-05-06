import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Globe } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeneralTab } from "../tabs/general-tab";

export const metadata: Metadata = { title: "Settings / General" };

export default async function SettingsGeneralePage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.settings"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={Globe}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.general.label")}
        subtitle={t("sections.general.description")}
      />
      <GeneralTab settings={settings} />
    </>
  );
}
