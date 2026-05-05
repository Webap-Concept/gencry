import "server-only";

import { db } from "@/lib/db/drizzle";
import { appLocales, type AppLocale } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

/**
 * Tutti i locale registrati (abilitati o no), ordinati per `sort_order` poi
 * per `code`. Pensata per la UI admin `/admin/settings/languages` e per il
 * LanguageSwitcher pubblico (che filtra solo `enabled = true` lato client).
 */
export async function getAllLocales(): Promise<AppLocale[]> {
  return db
    .select()
    .from(appLocales)
    .orderBy(asc(appLocales.sortOrder), asc(appLocales.code));
}

/** Locale con `is_default = true`, se presente. Usata per il warning env↔DB. */
export async function getDefaultLocaleFromDb(): Promise<AppLocale | null> {
  const [row] = await db
    .select()
    .from(appLocales)
    .where(eq(appLocales.isDefault, true))
    .limit(1);
  return row ?? null;
}

/** Aggiorna il flag `enabled` per un locale. */
export async function setLocaleEnabled(
  code: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(appLocales)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(appLocales.code, code));
}

/** Aggiorna `sort_order` per un locale. */
export async function setLocaleSortOrder(
  code: string,
  sortOrder: number,
): Promise<void> {
  await db
    .update(appLocales)
    .set({ sortOrder, updatedAt: new Date() })
    .where(eq(appLocales.code, code));
}

/** Aggiorna `native_label` per un locale (es. "Italiano", "English"). */
export async function setLocaleNativeLabel(
  code: string,
  nativeLabel: string,
): Promise<void> {
  await db
    .update(appLocales)
    .set({ nativeLabel, updatedAt: new Date() })
    .where(eq(appLocales.code, code));
}
