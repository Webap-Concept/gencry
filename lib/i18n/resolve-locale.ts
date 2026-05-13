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
  "/profile",
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
 * Priorità: cookie NEXT_LOCALE → Accept-Language → DEFAULT_LOCALE.
 * NB: `users.locale` non è raggiungibile da Edge senza round-trip al DB.
 * I Server Component dei layout, che hanno DB, sovrascrivono questo guess
 * chiamando `setRequestLocale(user.locale)` quando l'utente è loggato.
 */
export function guessLocaleFromRequest(request: NextRequest): Locale {
  const cookieValue = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieValue && isLocale(cookieValue)) return cookieValue;

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    for (const tag of parsed) {
      // Match "en", "en-US", "en-us"
      const base = tag.split("-")[0]?.toLowerCase();
      if (base && (LOCALES as readonly string[]).includes(base)) {
        return base as Locale;
      }
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Parsa Accept-Language ordinato per qualità (q=1.0 prima).
 * Esempio: "it-IT,it;q=0.9,en;q=0.7" → ["it-IT","it","en"]
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag.length > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}
