import { AppRightRail } from "@/components/layout/AppRightRail";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getSystemPageSlugs, isLegalsPathname } from "@/lib/db/pages-queries";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Suspense } from "react";
// Reset/typography per CMS templates (.tpl-*). Era ereditato dal vecchio
// (cms)/layout.tsx, ora rimosso: il fallback CMS arriva qui, quindi
// va caricato a questo livello. Vedi project_frontend_css_split.md.
import "@/app/(cms)/frontend.css";

/**
 * Layout outer per le rotte con primo segment dinamico (`/<x>` o `/<x>/...`).
 *
 * Due casi (Modello E i18n):
 *   1. `<x>` è un locale conosciuto (es. `/en`, `/en/about`):
 *      home guest in altra lingua o CMS in altra lingua. Il proxy.ts
 *      step [0] caso 1 redirige `/<default>/...` a `/<default-stripped>`
 *      quindi qui arriva SOLO `<x> ≠ DEFAULT_LOCALE`.
 *
 *   2. `<x>` NON è un locale conosciuto (es. `/privacy`, `/blog/post-1`):
 *      Next.js matcha questo route group perché ha priorità sul catch-all
 *      `(cms)/[...slug]`. I page handler `[locale]/page.tsx` e
 *      `[locale]/[...slug]/page.tsx` fanno fallback al rendering CMS
 *      trattando `<x>` come parte dello slug.
 *
 * Questo layout NON deve `notFound()` su locale invalido — sennò spara
 * 404 a tutte le pagine CMS pubbliche default-locale. Si limita a
 * settare `setRequestLocale` con il valore corretto e a wrappare lo
 * shell pubblico (header + footer + provider).
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const effectiveLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;

  // setRequestLocale segna il locale per i Server Components di static
  // rendering. Il NextIntlClientProvider è montato in app/layout.tsx (root)
  // e copre tutte le route della app.
  setRequestLocale(effectiveLocale);

  const [appSettings, slugs, headerList] = await Promise.all([
    getAppSettingsSafe(),
    getSystemPageSlugs(),
    headers(),
  ]);
  const pathname = headerList.get("x-pathname") ?? "/";
  // Locale prefix: se è presente, strippalo prima di confrontare lo slug
  // legals (es. /en/privacy → /privacy). Niente effetto per pathname senza
  // prefix locale.
  const legalsPath = isLocale(locale)
    ? pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/"
    : pathname;
  const showRail = !isLegalsPathname(legalsPath, slugs);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl flex">
          <main className="flex flex-1 flex-col min-w-0">{children}</main>
          {showRail && (
            <Suspense fallback={null}>
              <AppRightRail />
            </Suspense>
          )}
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
