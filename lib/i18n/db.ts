import "server-only";

import { db } from "@/lib/db/drizzle";
import { translations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { DEFAULT_LOCALE, type Locale } from "./config";

/**
 * Recupera una traduzione dinamica dal DB con fallback chain.
 *
 * Strategia:
 *   1. Prova `locale` richiesto.
 *   2. Se manca e `locale ≠ DEFAULT_LOCALE`, prova `DEFAULT_LOCALE`.
 *   3. Se manca anche lì, ritorna `fallback` (hardcoded dal chiamante).
 *
 * Pensata per contenuti **dinamici** (email body, legal pages, copy
 * admin-modificabile). Le chiavi UI statiche restano in
 * `messages/{locale}/<ns>.json` e usano next-intl direttamente —
 * quelle hanno una loro fallback chain a livello di loader (vedi
 * `i18n/request.ts`).
 */
export async function getDbTranslation(
  locale: Locale,
  namespace: string,
  key: string,
  fallback: string,
): Promise<string> {
  const lookup = async (loc: Locale): Promise<string | null> => {
    const [row] = await db
      .select({ value: translations.value })
      .from(translations)
      .where(
        and(
          eq(translations.locale, loc),
          eq(translations.namespace, namespace),
          eq(translations.key, key),
        ),
      )
      .limit(1);
    return row?.value ?? null;
  };

  const direct = await lookup(locale);
  if (direct !== null) return direct;

  if (locale !== DEFAULT_LOCALE) {
    const def = await lookup(DEFAULT_LOCALE);
    if (def !== null) return def;
  }

  return fallback;
}
