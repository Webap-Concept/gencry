import LandingPage from "@/components/landing-page";
import { getSession } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";
import { generatePageMetadata } from "@/lib/seo";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

/**
 * Home guest in altra lingua. Es. `/en` con default = it.
 *
 * - Loggato → redirect alla home canonica `/` (la sua lingua è già in
 *   `users.locale`, niente prefix nell'URL — vedi piano i18n decisione 6).
 * - Guest → landing coming-soon nel locale richiesto.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  // Per ora i meta della landing prefixed riusano quelli di "/" — la
  // localizzazione dei meta arriverà in PR-4 quando popoleremo il DB
  // SEO con varianti per locale.
  return generatePageMetadata("/");
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const session = await getSession();
  if (session) {
    redirect("/");
  }

  return <LandingPage />;
}
