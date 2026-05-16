import { CookiePreferencesTrigger } from "@/components/cookie-banner/preferences-trigger";
import type { BannerServicesByCategory } from "@/lib/db/cookie-services-queries";
import { getLocale, getTranslations } from "next-intl/server";
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

/**
 * Le 4 categorie ePrivacy fisse — definite localmente perché sono
 * standard di legge (non admin-editabili). Le label vivono in i18n
 * sotto `core.settings.privacy.cookies.categories.*`.
 */
type CategoryId =
  | "cookie_necessary"
  | "cookie_preferences"
  | "cookie_analytics"
  | "cookie_marketing";

const CATEGORIES: Array<{
  id: CategoryId;
  labelKey: "necessaryLabel" | "preferencesLabel" | "statisticsLabel" | "marketingLabel";
  descKey:
    | "necessaryDescription"
    | "preferencesDescription"
    | "statisticsDescription"
    | "marketingDescription";
  alwaysOn: boolean;
}> = [
  { id: "cookie_necessary", labelKey: "necessaryLabel", descKey: "necessaryDescription", alwaysOn: true },
  { id: "cookie_preferences", labelKey: "preferencesLabel", descKey: "preferencesDescription", alwaysOn: false },
  { id: "cookie_analytics", labelKey: "statisticsLabel", descKey: "statisticsDescription", alwaysOn: false },
  { id: "cookie_marketing", labelKey: "marketingLabel", descKey: "marketingDescription", alwaysOn: false },
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
export async function CookiesPanel({
  bannerEnabled,
  prefs,
  decidedAt,
  policyUrl,
  services,
}: Props) {
  const initialPrefs = prefs ?? undefined;
  const t = await getTranslations("core.settings.privacy.cookies");
  const tCat = await getTranslations("core.settings.privacy.cookies.categories");
  const locale = await getLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stateFor = (catId: CategoryId): boolean => {
    if (catId === "cookie_necessary") return true;
    if (!prefs) return false;
    if (catId === "cookie_preferences") return prefs.preferences;
    if (catId === "cookie_analytics") return prefs.analytics;
    return prefs.marketing;
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">{t("title")}</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">{t("description")}</p>
      </div>

      <article className="rounded-2xl border border-gc-line bg-gc-bg-2">
        <header className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold text-gc-fg">
                {t("currentStatus")}
              </h3>
              {!bannerEnabled && (
                <span className="rounded-full bg-gc-bg px-2 py-0.5 text-[11px] font-medium text-gc-fg-3">
                  {t("bannerDisabled")}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] text-gc-fg-3">
              {!bannerEnabled
                ? t("bannerDisabledInfo")
                : prefs && decidedAt
                  ? t("savedOn", { date: dateFmt.format(new Date(decidedAt)) })
                  : t("neverChosen")}
            </p>
          </div>

          {bannerEnabled && (
            <CookiePreferencesTrigger
              initialPrefs={initialPrefs}
              policyUrl={policyUrl}
              services={services}
              variant="button"
              label={prefs ? t("editPreferences") : t("openPreferences")}
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
                      {tCat(cat.labelKey)}
                      {cat.alwaysOn && (
                        <span className="ml-2 rounded-full bg-gc-bg px-2 py-0.5 text-[10px] font-medium text-gc-fg-3 uppercase">
                          {t("alwaysOn")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-gc-fg-3 mt-0.5">
                      {tCat(cat.descKey)}
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
                        <Check size={11} /> {t("active")}
                      </>
                    ) : (
                      <>
                        <Minus size={11} /> {t("inactive")}
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
