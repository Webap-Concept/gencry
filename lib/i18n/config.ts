/**
 * i18n config — fonte unica per locale supportati e default.
 *
 * Default locale = install-time config: si setta via env var
 * `I18N_DEFAULT_LOCALE` al deploy (vedi .env.example). Cambiarla dopo il
 * go-live richiede redeploy ed ha impatto SEO sugli URL senza prefix —
 * è un'operazione di setup, non un toggle runtime.
 *
 * Questo file è *sempre* importabile (server e client). Niente side effect.
 */

export const LOCALES = ["en", "it"] as const;
export type Locale = (typeof LOCALES)[number];

function resolveDefaultLocale(): Locale {
  const env = process.env.I18N_DEFAULT_LOCALE;
  if (env && (LOCALES as readonly string[]).includes(env)) {
    return env as Locale;
  }
  // Fallback "it": Gencry-prod parte da italiano. I customer white-label
  // settano `I18N_DEFAULT_LOCALE` esplicitamente nella loro env; chi clona
  // senza settare l'env riceve il default storico del repo.
  return "it";
}

export const DEFAULT_LOCALE: Locale = resolveDefaultLocale();

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
