import { getAdminPath } from "@/lib/admin-paths";
import {
  getCookieRegistry,
  getSnippetCountByService,
} from "@/lib/db/cookie-services-queries";
import { getEnabledLocales, getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CookieMasterSwitch } from "./_components/cookie-master-switch";
import { CookieServicesManager } from "./_components/cookie-services-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.compliance.cookies");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function CookiesCompliancePage() {
  const tC = await getTranslations("admin.compliance.cookies");
  const [settings, slugs, registry, locales, snippetCounts] = await Promise.all([
    getAppSettings(),
    getSystemPageSlugs(),
    getCookieRegistry(),
    getEnabledLocales(),
    getSnippetCountByService(),
  ]);

  const enabled = settings["gdpr.cookie_banner.enabled"] === "true";
  const cookiePolicySlug = slugs.cookie ?? null;

  return (
    <div className="space-y-8">
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

      {/* Section 3 — Services registry (CRUD) */}
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
        <CookieServicesManager
          registry={registry}
          locales={locales.map((l) => ({ code: l.code, nativeLabel: l.nativeLabel }))}
          bannerEnabled={enabled}
          snippetCounts={snippetCounts}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cookie policy card
// ---------------------------------------------------------------------------

async function CookiePolicyCard({ slug }: { slug: string | null }) {
  const t = await getTranslations("admin.compliance.cookies.policyCard");
  const pagesPath = await getAdminPath("content-pages");
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
            href={pagesPath}
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
