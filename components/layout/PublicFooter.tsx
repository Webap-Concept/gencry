import { CookiePreferencesTrigger } from "@/components/cookie-banner/preferences-trigger";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { readCookieConsent } from "@/lib/cookie-consent/cookie";
import { getServicesForBanner } from "@/lib/db/cookie-services-queries";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

/**
 * Footer per le pagine pubbliche (frontend pubblico + pagine di login
 * + landing guest).
 *
 * Pensato come slot condiviso per dati legali e link di servizio:
 * appena ci servirà esporre altri link (chi siamo, contatti, social),
 * vanno aggiunti qui senza moltiplicare i layout.
 *
 * Bottone "Preferenze cookie" — è mostrato SOLO se:
 *   1. il master switch admin è ON, e
 *   2. l'utente ha già preso una decisione (cookie presente).
 * Se il banner è ancora visibile (decisione non presa), il bottone
 * sarebbe ridondante e si sovrapporrebbe visivamente al banner sticky
 * bottom.
 */
export async function PublicFooter() {
  const [settings, slugs, cookieConsent, headersList, t] = await Promise.all([
    getAppSettings(),
    getSystemPageSlugs(),
    readCookieConsent(),
    headers(),
    getTranslations("public.footer"),
  ]);

  const localeHeader = headersList.get("x-locale");
  const currentLocale =
    localeHeader && isLocale(localeHeader) ? localeHeader : DEFAULT_LOCALE;
  const currentPath = headersList.get("x-pathname") ?? "/";

  const cookieBannerEnabled = settings["gdpr.cookie_banner.enabled"] === "true";
  const cookiePolicySlug = slugs.cookie ?? null;
  const cookiePolicyUrl = cookiePolicySlug ? `/${cookiePolicySlug}` : null;

  // Servizi cookie per il modal "modifica preferenze". Cached 10min,
  // costo trascurabile rispetto agli altri fetch del footer.
  const cookieServices = cookieBannerEnabled
    ? await getServicesForBanner(currentLocale)
    : undefined;
  const privacySlug = slugs.privacy ?? null;
  const termsSlug = slugs.terms ?? null;

  const initialPrefs = cookieConsent.hasDecision
    ? {
        preferences: cookieConsent.prefs.preferences,
        analytics: cookieConsent.prefs.analytics,
        marketing: cookieConsent.prefs.marketing,
      }
    : undefined;

  const year = new Date().getFullYear();
  const appName = settings.app_name || "App Name";

  return (
    <footer
      className="w-full border-t"
      style={{
        background: "#ffffff",
        borderColor: "#e5e7eb",
        color: "#4b5563",
      }}>
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12.5px]" style={{ color: "#6b7280" }}>
          © {year} {appName}. {t("rightsReserved")}
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]"
          aria-label={t("ariaLabel")}>
          {/* News: link statico al CMS news hub. Slug hardcoded perche'
              `/news` e' una system page del modulo news, non un legale
              risolto da getSystemPageSlugs. */}
          <Link
            href="/news"
            className="hover:underline"
            style={{ color: "#4b5563" }}>
            {t("news")}
          </Link>
          {termsSlug && (
            <Link
              href={`/${termsSlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              {t("terms")}
            </Link>
          )}
          {privacySlug && (
            <Link
              href={`/${privacySlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              {t("privacy")}
            </Link>
          )}
          {cookiePolicySlug && (
            <Link
              href={`/${cookiePolicySlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              {t("cookiePolicy")}
            </Link>
          )}
          {cookieBannerEnabled && cookieConsent.hasDecision && (
            <CookiePreferencesTrigger
              initialPrefs={initialPrefs}
              policyUrl={cookiePolicyUrl}
              services={cookieServices}
              variant="link"
              label={t("cookiePreferences")}
            />
          )}
          <LanguageSwitcher current={currentLocale} currentPath={currentPath} />
        </nav>
      </div>
    </footer>
  );
}
