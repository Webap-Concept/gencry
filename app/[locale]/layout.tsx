import { PublicFooter } from "@/components/layout/PublicFooter";
import { isLocale } from "@/lib/i18n/config";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

/**
 * Layout outer per le zone pubbliche con prefix locale (Modello E i18n).
 *
 * Matcha solo:
 *   - `/en` (e altri locale ≠ default) → home guest in altra lingua
 *   - `/en/<slug>` → pagine CMS pubbliche in altra lingua
 *
 * NOTA: la lingua di default (`I18N_DEFAULT_LOCALE`) è servita su URL
 * SENZA prefix dai layout (protected)/(frontend), non da qui.
 * Il proxy.ts step [0] caso 1 fa redirect 308 di `/<default>/...` →
 * `/...`, quindi questo segment è raggiunto SOLO per locale ≠ default.
 *
 * Le route system (auth/admin/loggati/api) NON arrivano mai qui: il
 * proxy fa redirect a `/<system-route>` + cookie locale. Vedi
 * `NON_PREFIXABLE_PREFIXES` in proxy.ts.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Locale invalido (es. /xx/qualcosa) → 404. Sostituisce il fallback al
  // catch-all CMS che farebbe lookup di "/xx/qualcosa" nel DB.
  if (!isLocale(locale)) {
    notFound();
  }

  // Abilita rendering statico per Server Components: il loader i18n usa
  // questo locale invece di leggere l'header x-locale.
  setRequestLocale(locale);

  // Carica i messaggi merged (default → locale) per Client Components che
  // useranno `useTranslations`. Server Components useranno `getTranslations`.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-[100dvh] flex-col">
        <div className="flex-1">{children}</div>
        <Suspense fallback={null}>
          <PublicFooter />
        </Suspense>
      </div>
    </NextIntlClientProvider>
  );
}
