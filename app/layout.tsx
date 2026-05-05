import { CookieBanner } from "@/components/cookie-banner/cookie-banner";
import { DynamicWrapper } from "@/components/dynamic-wrapper";
import { JsonLdScript } from "@/components/json-ld-script";
import MaintenancePage from "@/components/maintenance-page";
import { readCookieConsent } from "@/lib/cookie-consent/cookie";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getActiveSnippets } from "@/lib/db/snippets-queries";
import type { SiteSnippet, SnippetType } from "@/lib/db/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { Analytics } from "@vercel/analytics/next";
import type { Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { headers } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import { satoshi, instrumentSerif } from "./fonts";
import "./globals.css";

export const viewport: Viewport = {
  maximumScale: 1,
};

function faviconMimeFromUrl(url: string): string | undefined {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".svg")) return "image/svg+xml";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".ico")) return "image/x-icon";
  return undefined;
}

// ---------------------------------------------------------------------------
// Snippet HEAD — tag nativi, NON next/script, NON Suspense.
//
// RootLayout è async: recupera gli snippet prima del render e li passa
// come prop a HeadSnippets. In questo modo non c'è Suspense nell'<head>
// e Next.js non streama i tag in un <template> placeholder — finiscono
// direttamente nell'<head> statico del primo byte HTML.
// ---------------------------------------------------------------------------

function HeadSnippetTag({ s }: { s: SiteSnippet }) {
  const t = s.type as SnippetType;
  switch (t) {
    case "link_css":
      return <link rel="stylesheet" href={s.content} />;
    case "style":
      // eslint-disable-next-line react/no-danger
      return <style dangerouslySetInnerHTML={{ __html: s.content }} />;
    case "script_src":
      // eslint-disable-next-line react/no-danger
      return <script src={s.content} async />;
    case "script":
      return (
        // eslint-disable-next-line react/no-danger
        <script
          id={`snippet-head-${s.id}`}
          dangerouslySetInnerHTML={{ __html: s.content }}
        />
      );
    case "raw":
    default:
      // raw non è valido nell'<head> — ignorato
      return null;
  }
}

function HeadSnippets({ snippets }: { snippets: SiteSnippet[] }) {
  return (
    <>
      {snippets.map((s) => (
        <HeadSnippetTag key={s.id} s={s} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Snippet BODY END — next/script afterInteractive va bene qui.
// ---------------------------------------------------------------------------

function BodySnippetTag({ s }: { s: SiteSnippet }) {
  const t = s.type as SnippetType;
  switch (t) {
    case "script_src":
      return <Script src={s.content} strategy="afterInteractive" />;
    case "script":
      return (
        <Script
          id={`snippet-body-${s.id}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: s.content }}
        />
      );
    case "link_css":
      return <link rel="stylesheet" href={s.content} />;
    case "style":
      // eslint-disable-next-line react/no-danger
      return <style dangerouslySetInnerHTML={{ __html: s.content }} />;
    case "raw":
    default:
      // eslint-disable-next-line react/no-danger
      return <span dangerouslySetInnerHTML={{ __html: s.content }} style={{ display: "none" }} />;
  }
}

function BodyEndSnippets({ snippets }: { snippets: SiteSnippet[] }) {
  return (
    <>
      {snippets.map((s) => (
        <BodySnippetTag key={s.id} s={s} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout — async per risolvere snippet + settings in un unico Promise.all.
//
// Logica manutenzione:
// - Se maintenance_mode = "true" E la route NON è /admin* → mostra MaintenancePage
// - MaintenancePage è un componente statico (zero query DB)
// - Il check è sincrono nel render: nessun componente async annidato,
//   nessun Suspense aggiuntivo, zero overhead se la manutenzione è disattiva.
// ---------------------------------------------------------------------------

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const localeHeader = headersList.get("x-locale");
  const lang = localeHeader && isLocale(localeHeader) ? localeHeader : DEFAULT_LOCALE;

  const isAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");

  // Fetch unico: snippet + settings + cookie consent + system page slugs +
  // i18n messages. I messages sono caricati QUI così sia i Client Components
  // sotto qualunque route group (auth, admin, frontend, [locale]) trovano il
  // NextIntlClientProvider già montato. Vedi i18n/request.ts per la fallback
  // chain locale → DEFAULT_LOCALE.
  const [allSnippets, settings, cookieConsent, systemPageSlugs, messages] = await Promise.all([
    getActiveSnippets(),
    getAppSettings(),
    readCookieConsent(),
    getSystemPageSlugs(),
    getMessages(),
  ]);

  const headSnippets = allSnippets.filter((s) => s.position === "head");
  const bodySnippets = allSnippets.filter((s) => s.position === "body_end");

  const isMaintenance =
    settings.maintenance_mode === "true" && !isAdminRoute;

  // Cookie banner: solo nel frontend pubblico, mai in admin (gli admin sono
  // staff e accedono al pannello sapendo cosa traccia il sistema).
  // Se l'admin ha lasciato il master switch a OFF, il banner non appare —
  // e di conseguenza i cookie non-tecnici (analytics inclusi) restano OFF
  // perché manca un consenso esplicito. Decisione consapevole: meglio
  // non tracciare che tracciare senza base legale.
  const cookieBannerEnabled = settings["gdpr.cookie_banner.enabled"] === "true";
  const showCookieBanner =
    !isAdminRoute && !isMaintenance && cookieBannerEnabled && !cookieConsent.hasDecision;
  const analyticsAllowed = cookieBannerEnabled && cookieConsent.prefs.analytics;
  const cookiePolicyUrl = systemPageSlugs.cookie ? `/${systemPageSlugs.cookie}` : null;

  return (
    <html
      lang={lang}
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${satoshi.variable} ${instrumentSerif.variable}`}>
      <head>
        {/*
         * Favicon dinamico — sovrascrive app/favicon.ico quando l'admin
         * ne carica uno custom. Va prima degli snippet così un eventuale
         * snippet head con <link rel="icon"> ha l'ultima parola.
         */}
        {settings.app_favicon_url && (
          <link
            rel="icon"
            href={settings.app_favicon_url}
            type={faviconMimeFromUrl(settings.app_favicon_url)}
          />
        )}
        {/*
         * JsonLdScript rimane in Suspense: è opzionale e non urgente.
         * HeadSnippets NON usa Suspense: i dati sono già risolti sopra,
         * così i tag entrano nell'<head> statico del primo byte HTML.
         */}
        <Suspense fallback={null}>
          <JsonLdScript />
        </Suspense>
        <HeadSnippets snippets={headSnippets} />
      </head>
      <body className="min-h-[100dvh] bg-gray-50">
        <NextIntlClientProvider locale={lang} messages={messages}>
          {isMaintenance ? (
            <MaintenancePage />
          ) : (
            <Suspense fallback={null}>
              <DynamicWrapper>{children}</DynamicWrapper>
            </Suspense>
          )}
        </NextIntlClientProvider>
        {/* Snippet position="body_end" — afterInteractive, va bene nel body */}
        <BodyEndSnippets snippets={bodySnippets} />
        {showCookieBanner && <CookieBanner policyUrl={cookiePolicyUrl} />}
        {analyticsAllowed && <Analytics />}
      </body>
    </html>
  );
}
