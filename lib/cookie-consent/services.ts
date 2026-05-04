import type { ConsentType } from "@/lib/db/schema";

/**
 * Registry dei servizi che dipendono dal consenso cookie.
 *
 * Ogni voce rappresenta un servizio (sia first-party come la sessione, sia
 * third-party come Vercel Analytics) e dichiara la categoria a cui è
 * vincolato. La sezione admin `/admin/compliance/cookies` legge questo
 * registry per mostrare la matrice "categoria → servizi" e le tooltip del
 * banner pubblico possono attingere alla stessa fonte.
 *
 * Convenzione: aggiungi qui ogni nuovo servizio invece di hardcodarlo
 * nelle UI. La categoria deve essere una di:
 *   - cookie_necessary    (sempre attivi, art. 5(3) ePrivacy lo esclude da opt-in)
 *   - cookie_preferences  (memorizzazione preferenze UI, lingua, tema)
 *   - cookie_analytics    (telemetria/uso aggregato)
 *   - cookie_marketing    (advertising, retargeting, pixel)
 *
 * `firstParty=true` se il servizio è gestito da noi (es. cookie di sessione).
 * `firstParty=false` se è un terzo (Vercel, Google, ecc.) — utile per il
 * report admin e per documentazione policy.
 */

export type CookieCategoryId = Extract<
  ConsentType,
  "cookie_necessary" | "cookie_preferences" | "cookie_analytics" | "cookie_marketing"
>;

export type CookieService = {
  id: string;
  name: string;
  category: CookieCategoryId;
  description: string;
  firstParty: boolean;
  /** Provider (es. "Vercel", "Google"). Vuoto per first-party. */
  provider?: string;
  /** URL alla privacy policy del provider, se applicabile. */
  providerPolicyUrl?: string;
};

export const COOKIE_CATEGORIES: Array<{
  id: CookieCategoryId;
  label: string;
  description: string;
  /** True se la categoria è sempre attiva (no opt-in). */
  alwaysOn: boolean;
}> = [
  {
    id: "cookie_necessary",
    label: "Necessari",
    description:
      "Indispensabili per il funzionamento del sito (sessione, sicurezza, preferenze di base).",
    alwaysOn: true,
  },
  {
    id: "cookie_preferences",
    label: "Preferenze",
    description:
      "Memorizzano le tue scelte (lingua, tema, visualizzazioni) per personalizzare l'esperienza.",
    alwaysOn: false,
  },
  {
    id: "cookie_analytics",
    label: "Statistiche",
    description:
      "Ci aiutano a capire come viene usato il sito tramite dati aggregati e anonimi.",
    alwaysOn: false,
  },
  {
    id: "cookie_marketing",
    label: "Marketing",
    description:
      "Permettono di mostrare contenuti e annunci più rilevanti su questo sito o piattaforme di terze parti.",
    alwaysOn: false,
  },
];

export const COOKIE_SERVICES: CookieService[] = [
  // ── Necessari ────────────────────────────────────────────────────────────
  {
    id: "session",
    name: "Sessione utente",
    category: "cookie_necessary",
    description:
      "Cookie HttpOnly che mantiene autenticato l'utente loggato. Senza, ogni richiesta richiederebbe un nuovo login.",
    firstParty: true,
  },
  {
    id: "csrf",
    name: "Protezione CSRF",
    category: "cookie_necessary",
    description:
      "Token anti-forgery per le form e le server actions. Tutela da attacchi cross-site.",
    firstParty: true,
  },
  {
    id: "cookie_consent",
    name: "Stato consenso cookie",
    category: "cookie_necessary",
    description:
      "Cookie HttpOnly che memorizza la scelta dell'utente sul banner per non chiederla ad ogni visita.",
    firstParty: true,
  },
  // ── Preferences ──────────────────────────────────────────────────────────
  // (placeholder: nessun servizio attivo. Aggiungere quando si introdurrà
  // p.es. il theme switcher o la lingua persistita lato client.)

  // ── Analytics ────────────────────────────────────────────────────────────
  {
    id: "vercel_analytics",
    name: "Vercel Analytics",
    category: "cookie_analytics",
    description:
      "Conteggio anonimo dei page-view e metriche di performance lato edge. Nessun PII esfiltrato. Lo script viene caricato solo dopo l'opt-in dell'utente.",
    firstParty: false,
    provider: "Vercel Inc.",
    providerPolicyUrl: "https://vercel.com/legal/privacy-policy",
  },

  // ── Marketing ────────────────────────────────────────────────────────────
  // (placeholder: nessun servizio marketing oggi. Aggiungere qui Pixel,
  // GTM Marketing, retargeting, ecc. quando verranno introdotti.)
];

export function servicesByCategory(category: CookieCategoryId): CookieService[] {
  return COOKIE_SERVICES.filter((s) => s.category === category);
}
