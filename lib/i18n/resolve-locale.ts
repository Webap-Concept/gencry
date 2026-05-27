import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "./config";
import { LOCALE_COOKIE_NAME } from "./locale-cookie";

/**
 * Path che NON devono mai avere un prefix locale nell'URL: auth, admin,
 * onboarding, area loggati, API. Il proxy.ts redirige `/<locale>/<system>`
 * a `/<system>` + cookie locale; il LanguageSwitcher costruisce URL clean
 * usando questa stessa lista per non aggiungere prefix dove non serve.
 *
 * Razionale (Modello E del piano i18n): il prefix locale è semantico solo
 * per le pagine pubbliche (home guest + CMS catch-all). Auth/admin/loggati
 * non esprimono la lingua nell'URL — è una preferenza della sessione/utente.
 */
export const NON_PREFIXABLE_PREFIXES = [
  "/api",
  "/admin",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-device",
  "/staff-invite",
  "/onboarding",
  "/settings",
  "/explore",
  "/coins",
  "/notifiche",
  "/unauthorized",
] as const;

export function isNonPrefixablePath(
  path: string,
  extraPrefixes: readonly string[] = [],
): boolean {
  // `extraPrefixes` permette al caller (proxy.ts) di aggiungere prefissi
  // non-prefixable risolti runtime — es. l'admin URL slug configurato in
  // app_settings, che NON è hardcoded nell'array sopra (lo slug "/admin"
  // è il default ma viene preservato anche se l'admin sceglie un altro
  // valore tipo "/admincontrol").
  for (const p of NON_PREFIXABLE_PREFIXES) {
    if (path === p || path.startsWith(p + "/")) return true;
  }
  for (const p of extraPrefixes) {
    if (path === p || path.startsWith(p + "/")) return true;
  }
  return false;
}

/**
 * Estrae il locale dal primo segmento del pathname.
 * Ritorna null se il primo segmento non è un locale conosciuto.
 *
 * Esempi:
 *   "/en/about" → "en"
 *   "/it" → "it"
 *   "/about" → null
 *   "/" → null
 */
export function extractLocaleFromPathname(pathname: string): {
  locale: Locale;
  rest: string;
} | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first || !isLocale(first)) return null;
  const rest = "/" + segments.slice(1).join("/");
  return { locale: first as Locale, rest: rest === "/" ? "/" : rest };
}

/**
 * Stima il locale per una request senza prefix nell'URL (zone non-prefix:
 * auth/admin/protected). Edge runtime (proxy.ts), niente DB.
 *
 * Priorità: cookie NEXT_LOCALE → DEFAULT_LOCALE.
 *
 * Decisione 2026-05-22: rimosso lo step Accept-Language. Generazione
 * Crypto è italiano-first; rispettare l'header del browser (spesso
 * "en-US,en;q=0.9" anche su sistemi italiani) forniva inglese a default
 * agli anonimi, contro l'intenzione del prodotto. Chi vuole inglese:
 *   - clicca il LanguageSwitcher → cookie NEXT_LOCALE=en
 *   - oppure setta `users.locale='en'` nelle settings (lo riceve dal
 *     layout dei loggati via setRequestLocale)
 *   - oppure atterra su un link prefix /en/... (CMS catch-all)
 *
 * NB: `users.locale` non è raggiungibile da Edge senza round-trip al DB.
 * I Server Component dei layout, che hanno DB, sovrascrivono questo guess
 * chiamando `setRequestLocale(user.locale)` quando l'utente è loggato.
 */
export function guessLocaleFromRequest(request: NextRequest): Locale {
  const cookieValue = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieValue && isLocale(cookieValue)) return cookieValue;

  return DEFAULT_LOCALE;
}
