import { CookiePreferencesTrigger } from "@/components/cookie-banner/preferences-trigger";
import type { BannerServicesByCategory } from "@/lib/db/cookie-services-queries";
import { Check, Minus } from "lucide-react";

type Props = {
  /** Master switch admin: se OFF, l'utente non ha nulla da modificare. */
  bannerEnabled: boolean;
  /** Stato corrente del cookie consent (null se non ha ancora deciso). */
  prefs:
    | {
        preferences: boolean;
        analytics: boolean;
        marketing: boolean;
      }
    | null;
  decidedAt: string | null;
  policyUrl: string | null;
  /** Servizi attivi per categoria, prefetched dal page. */
  services?: BannerServicesByCategory;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Le 4 categorie ePrivacy fisse — definite localmente perché sono
 * standard di legge (non admin-editabili). Le label IT sono hardcoded
 * coerenti col resto di /settings/privacy (file non i18nato).
 */
const CATEGORIES: Array<{
  id: "cookie_necessary" | "cookie_preferences" | "cookie_analytics" | "cookie_marketing";
  label: string;
  description: string;
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

/**
 * Card "Preferenze cookie" per /settings/privacy.
 *
 * Mostra lo stato corrente per ognuna delle 4 categorie e un bottone
 * per riaprire il modale di personalizzazione (riusa lo stesso componente
 * client del banner pubblico per evitare divergenze).
 *
 * Se il banner è disabilitato dall'admin, mostriamo un messaggio
 * informativo invece del bottone — non c'è nulla da modificare quando
 * tutti i cookie non-essenziali sono già OFF per default.
 */
export function CookiesPanel({
  bannerEnabled,
  prefs,
  decidedAt,
  policyUrl,
  services,
}: Props) {
  const initialPrefs = prefs ?? undefined;

  const stateFor = (catId: (typeof CATEGORIES)[number]["id"]): boolean => {
    if (catId === "cookie_necessary") return true;
    if (!prefs) return false;
    if (catId === "cookie_preferences") return prefs.preferences;
    if (catId === "cookie_analytics") return prefs.analytics;
    return prefs.marketing;
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Preferenze cookie
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Gestisci le categorie di cookie che hai accettato. I cookie necessari
          sono sempre attivi: senza, il sito non funzionerebbe.
        </p>
      </div>

      <article className="rounded-2xl border border-gc-line bg-gc-bg-2">
        <header className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold text-gc-fg">
                Stato attuale
              </h3>
              {!bannerEnabled && (
                <span className="rounded-full bg-gc-bg px-2 py-0.5 text-[11px] font-medium text-gc-fg-3">
                  Banner disattivato
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] text-gc-fg-3">
              {!bannerEnabled
                ? "L'amministratore ha disattivato il banner cookie: tutti i cookie non essenziali sono spenti."
                : prefs && decidedAt
                  ? `Scelta salvata il ${dateFmt.format(new Date(decidedAt))}.`
                  : "Non hai ancora scelto. Il banner ti chiederà al prossimo accesso pubblico."}
            </p>
          </div>

          {bannerEnabled && (
            <CookiePreferencesTrigger
              initialPrefs={initialPrefs}
              policyUrl={policyUrl}
              services={services}
              variant="button"
              label={prefs ? "Modifica preferenze" : "Apri preferenze"}
            />
          )}
        </header>

        <div className="border-t border-gc-line px-4 py-4">
          <ul className="space-y-2">
            {CATEGORIES.map((cat) => {
              const active = stateFor(cat.id);
              return (
                <li
                  key={cat.id}
                  className="flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gc-fg">
                      {cat.label}
                      {cat.alwaysOn && (
                        <span className="ml-2 rounded-full bg-gc-bg px-2 py-0.5 text-[10px] font-medium text-gc-fg-3 uppercase">
                          Sempre attivi
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-gc-fg-3 mt-0.5">
                      {cat.description}
                    </div>
                  </div>
                  <span
                    className={
                      active
                        ? "inline-flex items-center gap-1 rounded-full bg-gc-success-bg px-2 py-0.5 text-[11px] font-medium text-gc-success-fg shrink-0"
                        : "inline-flex items-center gap-1 rounded-full bg-gc-bg px-2 py-0.5 text-[11px] font-medium text-gc-fg-3 shrink-0"
                    }>
                    {active ? (
                      <>
                        <Check size={11} /> Attivi
                      </>
                    ) : (
                      <>
                        <Minus size={11} /> Spenti
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    </section>
  );
}
