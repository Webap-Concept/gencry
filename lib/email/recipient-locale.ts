import "server-only";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { getLocaleCookie } from "@/lib/i18n/locale-cookie";

/**
 * Sceglie la locale con cui spedire un'email all'utente.
 * Priorità:
 *   1. `users.locale` se valida (utenti che hanno scelto la lingua dal profilo).
 *   2. Cookie `NEXT_LOCALE` della request corrente (per signup/forgot prima
 *      che esista una preferenza salvata: rispetta la lingua di navigazione).
 *   3. `DEFAULT_LOCALE` (fallback finale, env-driven).
 *
 * Da chiamare dentro server actions / route handlers — necessita il cookie
 * della request corrente.
 */
export async function resolveRecipientLocale(
  userLocale: string | null | undefined,
): Promise<Locale> {
  if (isLocale(userLocale)) return userLocale;
  const cookieLocale = await getLocaleCookie();
  if (cookieLocale) return cookieLocale;
  return DEFAULT_LOCALE;
}
