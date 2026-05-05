import { CmsPage, cmsPageMetadata } from "@/app/(frontend)/_render/cms-page";
import LandingPage from "@/components/landing-page";
import { getSession } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";
import { generatePageMetadata } from "@/lib/seo";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * Page handler per `/<x>` (Modello E i18n).
 *
 *   - `<x>` ∈ LOCALES (≠ default, perché il proxy redirige `/<default>` → `/`):
 *     home guest landing in altra lingua. Loggato → redirect a `/`.
 *
 *   - `<x>` ∉ LOCALES: fallback al CMS catch-all, trattando `<x>` come
 *     slug singolo (es. `/privacy`, `/cookie-policy`). Senza questo
 *     fallback, Next.js matcherebbe `[locale]/page.tsx` con priorità sul
 *     `(frontend)/[...slug]` e tutte le pagine CMS sarebbero 404.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    // Fallback CMS: il segmento è uno slug
    return cmsPageMetadata({ slug: [locale] });
  }

  // Per ora i meta della home prefixed riusano quelli di "/" — la
  // localizzazione dei meta arriverà in PR-4 quando popoleremo SEO per locale.
  return generatePageMetadata("/");
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    // Fallback CMS: il segmento è uno slug singolo
    return <CmsPage slug={[locale]} />;
  }

  setRequestLocale(locale);

  const session = await getSession();
  if (session) {
    redirect("/");
  }

  return <LandingPage />;
}
