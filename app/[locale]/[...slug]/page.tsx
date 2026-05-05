import { CmsPage, cmsPageMetadata } from "@/app/(frontend)/_render/cms-page";
import { isLocale } from "@/lib/i18n/config";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Page handler per `/<x>/<rest...>` (Modello E i18n).
 *
 *   - `<x>` ∈ LOCALES: pagina CMS in quella lingua. In PR-1b il lookup
 *     ignora ancora il locale (ritorna la pagina default); la query
 *     locale-aware arriverà in PR-4 con `getPageWithTemplate(slug, locale)`
 *     + `page_translations`.
 *
 *   - `<x>` ∉ LOCALES: fallback al CMS, trattando `<x>` come parte dello
 *     slug (es. `/blog/post-1` → slug `blog/post-1`). Necessario perché
 *     Next.js matcha `[locale]/[...slug]` con priorità sul
 *     `(frontend)/[...slug]`, quindi senza questo fallback le pagine CMS
 *     multi-segmento default-locale sarebbero tutte 404.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  const fullSlug = isLocale(locale) ? slug : [locale, ...slug];
  return cmsPageMetadata({ slug: fullSlug });
}

export default async function LocaleFrontendPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;

  if (!isLocale(locale)) {
    // Fallback CMS: il segmento è parte dello slug
    return <CmsPage slug={[locale, ...slug]} />;
  }

  setRequestLocale(locale);
  return <CmsPage slug={slug} />;
}
