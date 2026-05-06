import { getAllLocales } from "@/lib/db/locales-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getEmailTranslationsForLocale } from "@/lib/email/locale";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import type { Metadata } from "next";
import { EmailTemplatesTab } from "../tabs/email-templates-tab";

export const metadata: Metadata = { title: "Settings / Email" };

export default async function SettingsEmailPage() {
  const [settings, allLocales] = await Promise.all([
    getAppSettings(),
    getAllLocales(),
  ]);

  // Locale enabled, ordinati come in /admin/settings/languages, default sempre primo.
  const enabled = allLocales.filter((l) => l.enabled);
  const sorted = [
    ...enabled.filter((l) => l.code === DEFAULT_LOCALE),
    ...enabled.filter((l) => l.code !== DEFAULT_LOCALE),
  ];
  const locales = sorted
    .filter((l): l is typeof l & { code: Locale } => isLocale(l.code))
    .map((l) => ({
      code: l.code,
      nativeLabel: l.nativeLabel,
      isDefault: l.code === DEFAULT_LOCALE,
    }));

  // Pre-fetch overlay per tutte le locale non-default in parallelo.
  const nonDefaultCodes = locales
    .filter((l) => !l.isDefault)
    .map((l) => l.code);
  const overlayEntries = await Promise.all(
    nonDefaultCodes.map(async (code) => [
      code,
      await getEmailTranslationsForLocale(code),
    ] as const),
  );
  const overlays: Record<string, Record<string, string>> = {};
  for (const [code, map] of overlayEntries) overlays[code] = map;

  return (
    <EmailTemplatesTab
      settings={settings}
      locales={locales}
      overlays={overlays}
    />
  );
}
