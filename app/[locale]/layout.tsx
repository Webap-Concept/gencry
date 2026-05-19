import { PublicCmsShell } from "@/components/layout/PublicCmsShell";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { setRequestLocale } from "next-intl/server";
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
 * settare `setRequestLocale` con il valore corretto e a delegare il
 * chrome al `<PublicCmsShell>` condiviso (passando il locale per lo
 * strip del prefix nell'header lookup).
 */
// `dynamic = 'force-dynamic'` perché lo shell legge `x-pathname`:
// senza, il layout segment cache può inchiodare il primo path
// catturato e i fix di chrome non si vedono al refresh.
export const dynamic = "force-dynamic";

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

  // Lo shell strippa il prefix locale dal pathname (es. /en/altcoin/foo
  // → /altcoin/foo) prima del match isNews/isLegals: passiamo il locale
  // solo se è realmente un locale (non quando è parte dello slug CMS).
  return (
    <PublicCmsShell localePrefix={isLocale(locale) ? locale : undefined}>
      {children}
    </PublicCmsShell>
  );
}
