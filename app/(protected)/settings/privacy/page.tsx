import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  FileCheck2,
  Cookie,
  Eye,
  Download,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { getUser } from "@/lib/db/queries";
import { getAcceptedConsents, type ConsentSnapshot } from "@/lib/account/consents";
import { listMyExportJobs } from "@/lib/account/gdpr-export";
import { readCookieConsent } from "@/lib/cookie-consent/cookie";
import { getServicesForBanner } from "@/lib/db/cookie-services-queries";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ConsentsPanel, type ConsentVM } from "./_components/consents-panel";
import { CookiesPanel } from "./_components/cookies-panel";
import { DangerZone } from "./_components/danger-zone";
import { ExportPanel, type ExportJobVM } from "./_components/export-panel";
import { getMyPostPreferences } from "@/lib/modules/posts/preferences-actions";
import { PostsPrivacyPanel } from "@/lib/modules/posts/components/PostsPrivacyPanel";
import type { PostVisibility } from "@/lib/db/schema";

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

  // Default true: il modulo è on di default in questo deploy. Diventa false
  // solo se l'admin imposta esplicitamente "false" in app_settings.
  const postsEnabled =
    (settings as Record<string, string | null>)["modules.posts.enabled"] !==
    "false";

  let postsDefaultVisibility: PostVisibility | null = null;
  if (postsEnabled) {
    const res = await getMyPostPreferences();
    if (res.ok) postsDefaultVisibility = res.data?.defaultVisibility ?? "public";
  }

  const terms = consents.terms;
  const privacy = consents.privacy;
  const marketing = consents.marketing;

  const toIso = (v: Date | string | null): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
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

  const termsVM = toVM({
    fallbackTitle: "Termini e Condizioni",
    acceptedAt: user.acceptedTermsAt,
    acceptedVersion: user.acceptedTermsVersion,
    snapshot: terms,
  });
  const privacyVM = toVM({
    fallbackTitle: "Privacy Policy",
    acceptedAt: user.acceptedPrivacyAt,
    acceptedVersion: user.acceptedPrivacyVersion,
    snapshot: privacy,
  });
  const marketingVM = toVM({
    fallbackTitle: "Comunicazioni marketing",
    acceptedAt: user.acceptedMarketingAt,
    acceptedVersion: user.acceptedMarketingVersion,
    snapshot: marketing,
  });

  // ── Sub-labels (stato sintetico header chiuso) ───────────────────────────
  const t = await getTranslations("core.settings.privacy.accordion");
  const tVis = await getTranslations("posts.visibility");

  const consentsOutdated = [termsVM, privacyVM, marketingVM].filter(
    (c) => c.acceptedAt && !c.isCurrent,
  ).length;
  const consentsSubLabel =
    consentsOutdated > 0
      ? t("consents.outdated", { count: consentsOutdated })
      : t("consents.allCurrent");

  const cookiesBannerEnabled =
    (settings as Record<string, string | null>)["gdpr.cookie_banner.enabled"] ===
    "true";
  const cookiesSubLabel = !cookiesBannerEnabled
    ? t("cookies.bannerDisabled")
    : !cookieConsent.hasDecision
      ? t("cookies.noDecision")
      : t("cookies.customized");

  const postsSubLabel = postsDefaultVisibility
    ? t("posts.current", { visibility: tVis(`${postsDefaultVisibility}_label`) })
    : null;

  const exportSubLabel =
    exportJobsVM.length === 0
      ? t("export.none")
      : t("export.count", { count: exportJobsVM.length });

  // ── Auto-open (problem-state cards) ──────────────────────────────────────
  const defaultOpen: string[] = [];
  if (consentsOutdated > 0) defaultOpen.push("consents");
  if (cookiesBannerEnabled && !cookieConsent.hasDecision)
    defaultOpen.push("cookies");

  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen}
      className="overflow-hidden rounded-2xl border border-gc-line bg-gc-bg-2"
    >
      <PrivacyAccordionItem
        value="consents"
        icon={FileCheck2}
        title={t("consents.title")}
        subLabel={consentsSubLabel}
        attention={consentsOutdated > 0}
      >
        <ConsentsPanel
          terms={termsVM}
          privacy={privacyVM}
          marketing={marketingVM}
        />
      </PrivacyAccordionItem>

      <PrivacyAccordionItem
        value="cookies"
        icon={Cookie}
        title={t("cookies.title")}
        subLabel={cookiesSubLabel}
        attention={cookiesBannerEnabled && !cookieConsent.hasDecision}
      >
        <CookiesPanel
          bannerEnabled={cookiesBannerEnabled}
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
      </PrivacyAccordionItem>

      {postsEnabled && postsDefaultVisibility ? (
        <PrivacyAccordionItem
          value="posts"
          icon={Eye}
          title={t("posts.title")}
          subLabel={postsSubLabel}
        >
          <PostsPrivacyPanel
            initialDefaultVisibility={postsDefaultVisibility}
          />
        </PrivacyAccordionItem>
      ) : null}

      <PrivacyAccordionItem
        value="export"
        icon={Download}
        title={t("export.title")}
        subLabel={exportSubLabel}
      >
        <ExportPanel jobs={exportJobsVM} />
      </PrivacyAccordionItem>

      <PrivacyAccordionItem
        value="danger"
        icon={Trash2}
        title={t("danger.title")}
        tone="danger"
      >
        <DangerZone hasPassword={user.passwordHash !== null} />
      </PrivacyAccordionItem>
    </Accordion>
  );
}

function PrivacyAccordionItem({
  value,
  icon: Icon,
  title,
  subLabel,
  attention,
  tone,
  children,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  subLabel?: string | null;
  attention?: boolean;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const iconWrapClass =
    tone === "danger"
      ? "bg-gc-neg/10 text-gc-neg"
      : "bg-gc-bg text-gc-fg-3";
  return (
    <AccordionItem
      value={value}
      className="border-b border-gc-line last:border-b-0"
    >
      <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-gc-bg-3/40 transition-colors rounded-none">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-gc-fg truncate">
                {title}
              </span>
              {attention ? (
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-gc-warning-fg shrink-0"
                  title="Richiede attenzione"
                />
              ) : null}
            </div>
            {subLabel ? (
              <p className="text-[12px] text-gc-fg-3 truncate mt-0.5">
                {subLabel}
              </p>
            ) : null}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pt-1 pb-5">{children}</AccordionContent>
    </AccordionItem>
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
