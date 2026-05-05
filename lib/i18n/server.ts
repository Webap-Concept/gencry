import "server-only";

import { headers } from "next/headers";
import { setRequestLocale as setNextIntlRequestLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Helper per zone NON-prefix (auth/admin/protected/onboarding/preview/frontend
 * default locale). Legge il locale dall'header `x-locale` (settato da
 * proxy.ts) e chiama `setRequestLocale` di next-intl.
 *
 * Va chiamato all'inizio dei layout di route group, idealmente prima di
 * altre query DB / sessione, per dare il "tag" al request prima del
 * rendering. Quando, in PR-5, l'utente loggato avrà `users.locale`, i
 * layout di admin/protected potranno chiamare `setRequestLocale(user.locale)`
 * sovrascrivendo questo guess.
 */
export async function setRequestLocaleFromHeaders(): Promise<Locale> {
  const headersList = await headers();
  const localeHeader = headersList.get("x-locale");
  const locale: Locale =
    localeHeader && isLocale(localeHeader) ? localeHeader : DEFAULT_LOCALE;
  setNextIntlRequestLocale(locale);
  return locale;
}
