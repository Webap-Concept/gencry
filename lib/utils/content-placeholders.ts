import type { AppSettings } from "@/lib/db/settings-queries";

/**
 * Mappa di tutti i placeholder disponibili nel contenuto CMS.
 * Chiave  = token che l'editor scrive (es. {{appName}})
 * Valore  = funzione che riceve le settings e ritorna la stringa da sostituire
 *
 * Aggiungere qui nuovi token — verranno automaticamente mostrati
 * nel pannello suggerimenti dell'editor.
 *
 * Sintassi: mustache double-brace `{{token}}`. Allinea con gli email
 * templates e non collide con ICU MessageFormat di next-intl (single-brace
 * `{x}` lì sarebbe interpretato come variabile).
 */
export const PLACEHOLDER_MAP: Record<
  string,
  { description: string; resolve: (s: AppSettings) => string }
> = {
  appName: {
    description: "Application name",
    resolve: (s) => s.app_name,
  },
  appDescription: {
    description: "Application description",
    resolve: (s) => s.app_description,
  },
  appDomain: {
    description: "Domain (e.g. https://mydomain.com)",
    resolve: (s) => s.app_domain,
  },
  emailFrom: {
    description: "Sender email address",
    resolve: (s) => s.email_from_address ?? s.app_name,
  },
  currentYear: {
    description: "Current year",
    resolve: () => String(new Date().getFullYear()),
  },
};

/**
 * Sostituisce tutti i token {{xxx}} nel contenuto HTML con i valori reali.
 * Token non riconosciuti vengono lasciati inalterati.
 * Sicuro: la sostituzione avviene lato server prima del render.
 */
export function resolvePlaceholders(html: string, settings: AppSettings): string {
  return html.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (match, token) => {
    const entry = PLACEHOLDER_MAP[token];
    if (!entry) return match; // token sconosciuto — lascia invariato
    return entry.resolve(settings);
  });
}
