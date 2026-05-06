import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  getAllLocales,
  getDefaultLocaleFromDb,
} from "@/lib/db/locales-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { Languages } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguagesTab } from "./_components/languages-tab";

export const metadata: Metadata = { title: "Settings / Languages" };

export default async function SettingsLanguagesPage() {
  await requireAdminSectionPage("admin:languages");

  const [locales, defaultFromDb, t] = await Promise.all([
    getAllLocales(),
    getDefaultLocaleFromDb(),
    getTranslations("admin.settings"),
  ]);

  return (
    <>
      <AdminSectionHeader
        icon={Languages}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.languages.label")}
        subtitle={t("sections.languages.description")}
      />
      <LanguagesTab
        locales={locales}
        envDefault={DEFAULT_LOCALE}
        dbDefaultCode={defaultFromDb?.code ?? null}
      />
    </>
  );
}
