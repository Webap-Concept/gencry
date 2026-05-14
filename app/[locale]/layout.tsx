import { AppRightRail } from "@/components/layout/AppRightRail";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
// Reset/typography per CMS templates (.tpl-*). Era ereditato dal vecchio
// (frontend)/layout.tsx, ora rimosso: il fallback CMS arriva qui, quindi
// va caricato a questo livello. Vedi project_frontend_css_split.md.
import "@/app/(frontend)/frontend.css";

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
 *      `(frontend)/[...slug]`. I page handler `[locale]/page.tsx` e
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

  const appSettings = await getAppSettingsSafe();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl flex">
          <main className="flex flex-1 flex-col min-w-0">{children}</main>
          <Suspense fallback={null}>
            <AppRightRail />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
