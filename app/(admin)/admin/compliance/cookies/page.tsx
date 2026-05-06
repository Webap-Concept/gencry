import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import {
  COOKIE_CATEGORIES,
  servicesByCategory,
} from "@/lib/cookie-consent/services";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cookie,
  ExternalLink,
  Globe,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CookieMasterSwitch } from "./_components/cookie-master-switch";
import { CookiesAdminGuide } from "./_components/cookies-admin-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.compliance.cookies");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function CookiesCompliancePage() {
  const t = await getTranslations("admin.compliance");
  const tC = await getTranslations("admin.compliance.cookies");
  const [settings, slugs] = await Promise.all([
    getAppSettings(),
    getSystemPageSlugs(),
  ]);

  const enabled = settings["gdpr.cookie_banner.enabled"] === "true";
  const cookiePolicySlug = slugs.cookie ?? null;

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Cookie size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
              <span style={{ color: "var(--admin-text-muted)" }}>{t("breadcrumb")}</span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>{tC("pageTitle")}</span>
            </h2>
            <AdminSectionInfo
              title={tC("guideTitle")}
              ariaLabel={tC("guideAriaLabel")}>
              <CookiesAdminGuide />
            </AdminSectionInfo>
          </div>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {tC("pageSubtitle")}
          </p>
        </div>
      </header>

      {/* Section 1 — Master switch */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {tC("sectionBanner")}
        </h2>
        <CookieMasterSwitch enabled={enabled} />
      </section>

      {/* Section 2 — Cookie policy page */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {tC("sectionPolicy")}
        </h2>
        <CookiePolicyCard slug={cookiePolicySlug} />
      </section>

      {/* Section 3 — Services registry */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {tC("sectionServices")}
        </h2>
        <p
          className="text-[12px] mb-4"
          style={{ color: "var(--admin-text-faint)" }}>
          {tC.rich("servicesIntro", {
            c: (chunks) => <code>{chunks}</code>,
          })}
        </p>
        <div className="space-y-4">
          {COOKIE_CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              services={servicesByCategory(cat.id)}
              bannerEnabled={enabled}
              t={tC}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cookie policy card
// ---------------------------------------------------------------------------

async function CookiePolicyCard({ slug }: { slug: string | null }) {
  const t = await getTranslations("admin.compliance.cookies.policyCard");
  const hasPage = slug !== null;

  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("title")}
            </h3>
            {hasPage ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800">
                <CheckCircle2 size={11} /> {t("statusFound")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800">
                <AlertTriangle size={11} /> {t("statusMissing")}
              </span>
            )}
          </div>
          <p
            className="text-[12px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {hasPage ? t("descFound") : t("descMissing")}
          </p>
          {hasPage && (
            <p
              className="text-[11px] mt-2 font-mono"
              style={{ color: "var(--admin-text-muted)" }}>
              /{slug}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Link
            href="/admin/content/pages"
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              background: "var(--admin-page-bg)",
              color: "var(--admin-text-muted)",
              border: "1px solid var(--admin-input-border)",
            }}>
            {t("editButton")}
          </Link>
          {hasPage && (
            <a
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--admin-page-bg)",
                color: "var(--admin-text-muted)",
                border: "1px solid var(--admin-input-border)",
              }}>
              {t("previewButton")}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category card with services list
// ---------------------------------------------------------------------------

type CategoryCardProps = {
  category: (typeof COOKIE_CATEGORIES)[number];
  services: ReturnType<typeof servicesByCategory>;
  bannerEnabled: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"admin.compliance.cookies">>>;
};

function CategoryCard({
  category,
  services,
  bannerEnabled,
  t,
}: CategoryCardProps) {
  // Stato pratico della categoria:
  //   - alwaysOn → sempre attiva
  //   - banner OFF → categoria non-essenziale è SPENTA per tutti i visitatori
  //   - banner ON  → dipende dal singolo opt-in (qui mostriamo solo "configurabile")
  const status: "always_on" | "blocked" | "user_choice" = category.alwaysOn
    ? "always_on"
    : !bannerEnabled
      ? "blocked"
      : "user_choice";

  const badge = (() => {
    if (status === "always_on") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-800">
          {t("categoryCard.badgeAlwaysOn")}
        </span>
      );
    }
    if (status === "blocked") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-medium text-rose-800">
          {t("categoryCard.badgeBlocked")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800">
        {t("categoryCard.badgeUserChoice")}
      </span>
    );
  })();

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div
        className="flex flex-wrap items-start justify-between gap-3 p-5"
        style={{ borderBottom: "1px solid var(--admin-card-border)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {category.label}
            </h3>
            {badge}
          </div>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {category.description}
          </p>
          <p
            className="text-[10.5px] mt-1 font-mono"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("categoryCard.consentTypeLabel", { id: category.id })}
          </p>
        </div>
      </div>

      {services.length === 0 ? (
        <div
          className="px-5 py-4 text-[12px]"
          style={{ color: "var(--admin-text-faint)" }}>
          {t("categoryCard.noServices")}
        </div>
      ) : (
        <ul>
          {services.map((s, idx) => (
            <li
              key={s.id}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
              style={
                idx > 0
                  ? { borderTop: "1px solid var(--admin-card-border)" }
                  : undefined
              }>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "var(--admin-text)" }}>
                    {s.name}
                  </span>
                  {s.firstParty ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      <Building2 size={10} /> {t("categoryCard.firstParty")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                      <Globe size={10} /> {t("categoryCard.thirdParty")}
                    </span>
                  )}
                </div>
                <p
                  className="text-[11.5px] mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {s.description}
                </p>
                {s.provider && (
                  <p
                    className="text-[10.5px] mt-1"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {t("categoryCard.providerLabel")} {s.provider}
                    {s.providerPolicyUrl && (
                      <>
                        {" — "}
                        <a
                          href={s.providerPolicyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 underline">
                          {t("categoryCard.providerPolicyLink")}
                          <ExternalLink size={9} />
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
