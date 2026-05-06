import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ModeTab } from "../tabs/mode-tab";

export const metadata: Metadata = { title: "Settings / Operation Mode" };

export default async function SettingsModePage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.settings"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={SlidersHorizontal}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.operation-mode.label")}
        subtitle={t("sections.operation-mode.description")}
      />
      <ModeTab settings={settings} />
    </>
  );
}
