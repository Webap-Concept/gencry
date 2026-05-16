import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  getAllLocales,
  getDefaultLocaleFromDb,
} from "@/lib/db/locales-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { LanguagesTab } from "./_components/languages-tab";

export const metadata: Metadata = { title: "Settings / Languages" };

export default async function SettingsLanguagesPage() {
  await requireAdminSectionPage("admin:languages");

  const [locales, defaultFromDb] = await Promise.all([
    getAllLocales(),
    getDefaultLocaleFromDb(),
  ]);

  return (
    <LanguagesTab
      locales={locales}
      envDefault={DEFAULT_LOCALE}
      dbDefaultCode={defaultFromDb?.code ?? null}
    />
  );
}
