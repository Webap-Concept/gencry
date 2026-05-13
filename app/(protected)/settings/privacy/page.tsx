import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUser } from "@/lib/db/queries";
import { getAcceptedConsents, type ConsentSnapshot } from "@/lib/account/consents";
import { listMyExportJobs } from "@/lib/account/gdpr-export";
import { readCookieConsent } from "@/lib/cookie-consent/cookie";
import { getServicesForBanner } from "@/lib/db/cookie-services-queries";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import { ConsentsPanel, type ConsentVM } from "./_components/consents-panel";
import { CookiesPanel } from "./_components/cookies-panel";
import { DangerZone } from "./_components/danger-zone";
import { ExportPanel, type ExportJobVM } from "./_components/export-panel";

export default async function PrivacySettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const headersList = await headers();
  const localeHeader = headersList.get("x-locale");
  const userLocale =
    user.locale && isLocale(user.locale)
      ? user.locale
      : localeHeader && isLocale(localeHeader)
        ? localeHeader
        : DEFAULT_LOCALE;

  // Le 3 policy (terms/privacy/marketing) vengono risolte in una singola
  // call batch: max 2 query DB invece di 6 (era 2 query x 3 policy).
  const [
    consents,
    exportJobs,
    cookieConsent,
    settings,
    slugs,
    cookieServices,
  ] = await Promise.all([
    getAcceptedConsents([
      { systemKey: "terms", acceptedVersion: user.acceptedTermsVersion },
      { systemKey: "privacy", acceptedVersion: user.acceptedPrivacyVersion },
      { systemKey: "marketing", acceptedVersion: user.acceptedMarketingVersion },
    ]),
    listMyExportJobs(user.id, 5),
    readCookieConsent(),
    getAppSettings(),
    getSystemPageSlugs(),
    getServicesForBanner(userLocale),
  ]);

  const terms = consents.terms;
  const privacy = consents.privacy;
  const marketing = consents.marketing;

  // Robustezza: il tipo dice Date ma in alcuni path di runtime (cold cache,
  // post-revalidate streaming RSC) i timestamp di Drizzle/postgres-js sono
  // arrivati come string e `.toISOString()` esplodeva, rompendo lo stream
  // della response e bloccando i bottoni di salvataggio downstream.
  const toIso = (v: Date | string | null): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    // string ISO o altro: ricostruisci Date e ri-serializza per format consistente.
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const expiresMs = (v: Date | string | null): number | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.getTime();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  const exportJobsVM: ExportJobVM[] = exportJobs.map((j) => {
    const expMs = expiresMs(j.expiresAt);
    return {
      id: j.id,
      status: j.status,
      requestedAt: toIso(j.requestedAt) ?? new Date(0).toISOString(),
      completedAt: toIso(j.completedAt),
      expiresAt: toIso(j.expiresAt),
      canDownload:
        j.status === "ready" &&
        j.hasFile &&
        (expMs === null || expMs > Date.now()),
    };
  });

  return (
    <div className="space-y-12">
      <ConsentsPanel
        terms={toVM({
          fallbackTitle: "Termini e Condizioni",
          acceptedAt: user.acceptedTermsAt,
          acceptedVersion: user.acceptedTermsVersion,
          snapshot: terms,
        })}
        privacy={toVM({
          fallbackTitle: "Privacy Policy",
          acceptedAt: user.acceptedPrivacyAt,
          acceptedVersion: user.acceptedPrivacyVersion,
          snapshot: privacy,
        })}
        marketing={toVM({
          fallbackTitle: "Comunicazioni marketing",
          acceptedAt: user.acceptedMarketingAt,
          acceptedVersion: user.acceptedMarketingVersion,
          snapshot: marketing,
        })}
      />

      <CookiesPanel
        bannerEnabled={settings["gdpr.cookie_banner.enabled"] === "true"}
        prefs={
          cookieConsent.hasDecision
            ? {
                preferences: cookieConsent.prefs.preferences,
                analytics: cookieConsent.prefs.analytics,
                marketing: cookieConsent.prefs.marketing,
              }
            : null
        }
        decidedAt={
          cookieConsent.hasDecision ? cookieConsent.decidedAt : null
        }
        policyUrl={slugs.cookie ? `/${slugs.cookie}` : null}
        services={cookieServices}
      />

      <ExportPanel jobs={exportJobsVM} />

      <DangerZone hasPassword={user.passwordHash !== null} />
    </div>
  );
}

function toVM(input: {
  fallbackTitle: string;
  acceptedAt: Date | null;
  acceptedVersion: string | null;
  snapshot: ConsentSnapshot | null;
}): ConsentVM {
  const { fallbackTitle, acceptedAt, acceptedVersion, snapshot } = input;

  return {
    title: snapshot?.title || fallbackTitle,
    acceptedAt: acceptedAt?.toISOString() ?? null,
    acceptedVersion,
    currentVersion: snapshot?.currentVersion ?? null,
    contentHtml: snapshot ? sanitizeRichTextHtml(snapshot.content) : null,
    isCurrent: snapshot?.isCurrent ?? false,
  };
}
