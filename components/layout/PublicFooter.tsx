import { CookiePreferencesTrigger } from "@/app/(frontend)/_components/cookie-banner/preferences-trigger";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { readCookieConsent } from "@/lib/cookie-consent/cookie";
import Link from "next/link";

/**
 * Footer per le pagine pubbliche (frontend pubblico + pagine di login).
 *
 * Pensato come slot condiviso per dati legali e link di servizio:
 * appena ci servirà esporre altri link (chi siamo, contatti, social),
 * vanno aggiunti qui senza moltiplicare i layout.
 *
 * Mostra il bottone "Preferenze cookie" SOLO se il banner è abilitato
 * dall'admin: se il master switch è OFF, non c'è nulla da modificare
 * (tutti i cookie non-essenziali sono già OFF per default).
 */
export async function PublicFooter() {
  const [settings, slugs, cookieConsent] = await Promise.all([
    getAppSettings(),
    getSystemPageSlugs(),
    readCookieConsent(),
  ]);

  const cookieBannerEnabled = settings["gdpr.cookie_banner.enabled"] === "true";
  const cookiePolicySlug = slugs.cookie ?? null;
  const cookiePolicyUrl = cookiePolicySlug ? `/${cookiePolicySlug}` : null;
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
  const appName = settings.app_name || "Generazione Crypto";

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
          © {year} {appName}. Tutti i diritti riservati.
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]"
          aria-label="Footer">
          {termsSlug && (
            <Link
              href={`/${termsSlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              Termini
            </Link>
          )}
          {privacySlug && (
            <Link
              href={`/${privacySlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              Privacy
            </Link>
          )}
          {cookiePolicySlug && (
            <Link
              href={`/${cookiePolicySlug}`}
              className="hover:underline"
              style={{ color: "#4b5563" }}>
              Cookie policy
            </Link>
          )}
          {cookieBannerEnabled && (
            <CookiePreferencesTrigger
              initialPrefs={initialPrefs}
              policyUrl={cookiePolicyUrl}
              variant="link"
              label="Preferenze cookie"
            />
          )}
        </nav>
      </div>
    </footer>
  );
}
