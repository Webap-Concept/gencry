import "server-only";

import { db } from "@/lib/db/drizzle";
import { translations } from "@/lib/db/schema";
import { getAppSettings, type AppSettings } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { and, eq } from "drizzle-orm";

/**
 * Namespace per le traduzioni dei template email salvate in `translations`.
 * La locale di default vive sempre in `app_settings` (zero migrazione, retro-
 * compatibile col flusso di salvataggio storico). Le altre locali sono overlay:
 * presenti solo se l'admin le ha effettivamente compilate. Fallback: default.
 */
export const EMAIL_TRANSLATIONS_NAMESPACE = "email";

/**
 * Ritorna `AppSettings` con le chiavi email_* sovrascritte dai valori per la
 * locale richiesta, se presenti. Per la locale di default è un no-op (ritorna
 * direttamente il fetch base). Per locali non-default fa una sola query
 * aggiuntiva e applica solo le chiavi che hanno un override compilato.
 */
export async function getLocalizedEmailSettings(
  locale: Locale,
): Promise<AppSettings> {
  const settings = await getAppSettings();
  if (locale === DEFAULT_LOCALE) return settings;

  const rows = await db
    .select({ key: translations.key, value: translations.value })
    .from(translations)
    .where(
      and(
        eq(translations.locale, locale),
        eq(translations.namespace, EMAIL_TRANSLATIONS_NAMESPACE),
      ),
    );

  if (rows.length === 0) return settings;

  const overlay = { ...settings } as Record<string, string | null>;
  for (const row of rows) {
    // Override solo se non vuoto: stringa vuota = "non tradotto", fallback al default.
    if (row.value && row.value.trim().length > 0) {
      overlay[row.key] = row.value;
    }
  }
  return overlay as AppSettings;
}

/**
 * Lookup mirato per una singola chiave email, per la admin UI: ritorna il
 * valore *grezzo* salvato per la locale (senza fallback al default), così
 * il form sa distinguere "non tradotto" (null) da "tradotto a stringa vuota"
 * (che non dovrebbe esistere ma trattiamo comunque come null).
 */
export async function getEmailTranslationsForLocale(
  locale: Locale,
): Promise<Record<string, string>> {
  if (locale === DEFAULT_LOCALE) return {};
  const rows = await db
    .select({ key: translations.key, value: translations.value })
    .from(translations)
    .where(
      and(
        eq(translations.locale, locale),
        eq(translations.namespace, EMAIL_TRANSLATIONS_NAMESPACE),
      ),
    );
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null) out[row.key] = row.value;
  }
  return out;
}

/**
 * Upsert di una singola chiave email per una locale non-default. Per la
 * locale di default usare `updateAppSetting` direttamente (i valori default
 * vivono in `app_settings`, non in `translations`).
 *
 * Stringa vuota dopo trim → DELETE della riga (così ricade sul default).
 */
export async function upsertEmailTranslation(
  locale: Locale,
  key: string,
  value: string | null,
): Promise<void> {
  if (locale === DEFAULT_LOCALE) {
    throw new Error(
      "upsertEmailTranslation: default locale must be saved via updateAppSetting",
    );
  }
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    await db
      .delete(translations)
      .where(
        and(
          eq(translations.locale, locale),
          eq(translations.namespace, EMAIL_TRANSLATIONS_NAMESPACE),
          eq(translations.key, key),
        ),
      );
    return;
  }
  await db
    .insert(translations)
    .values({
      locale,
      namespace: EMAIL_TRANSLATIONS_NAMESPACE,
      key,
      value: trimmed,
    })
    .onConflictDoUpdate({
      target: [translations.locale, translations.namespace, translations.key],
      set: { value: trimmed, updatedAt: new Date() },
    });
}
