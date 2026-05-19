/**
 * Layout isolato per il frontend pubblico (pagine CMS gestite da admin).
 *
 * Header + (right rail su lg+) + footer. Il rail riusa lo stesso slot
 * registry del shell loggato per esporre adv/sponsor anche ai
 * visitatori non loggati — eccetto sulle pagine legali (privacy,
 * cookie, terms) dove l'attenzione deve restare sul documento, niente
 * promo / adv.
 *
 * Gli snippet globali (head/body_end) sono iniettati dal RootLayout
 * in app/layout.tsx, che è l'unico posto in cui next/script
 * strategy="beforeInteractive" viene hoistato nel <head> reale.
 */
import { AppRightRail } from "@/components/layout/AppRightRail";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import {
  getSystemPageSlugs,
  isLegalsPathname,
  isNewsPathname,
} from "@/lib/db/pages-queries";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ResetScrollOnPath } from "./_components/reset-scroll-on-path";
import "./frontend.css";

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  const [appSettings, slugs, headerList] = await Promise.all([
    getAppSettingsSafe(),
    getSystemPageSlugs(),
    headers(),
  ]);
  const pathname = headerList.get("x-pathname") ?? "/";
  const isNews = isNewsPathname(pathname);
  // Rail off su: legals (privacy/terms/cookie) + news (layout editoriale
  // dedicato full-width). Il main occupa tutta la larghezza in quei casi.
  const showRail = !isLegalsPathname(pathname, slugs) && !isNews;
  // Niente max-w container quando siamo nel blog: le pagine /news* hanno
  // un loro layout con .news-container che gestisce padding e centering;
  // il flex max-w-7xl del layout cms restringerebbe i blocchi full-bleed
  // (ticker, feature cover) facendoli sembrare incassati.
  const fullBleed = isNews;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <ResetScrollOnPath />
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div
          className={
            fullBleed
              ? "w-full"
              : "mx-auto w-full max-w-7xl flex"
          }
        >
          {fullBleed ? (
            <main className="w-full">{children}</main>
          ) : (
            <>
              {/* main flex-1 + min-w-0 per non far esplodere il layout
                  con content larghi. Sui legals il rail è disabilitato,
                  quindi il main occupa tutta la larghezza (max-w-7xl). */}
              <main className="flex flex-1 flex-col min-w-0">{children}</main>
              {showRail && (
                <Suspense fallback={null}>
                  <AppRightRail />
                </Suspense>
              )}
            </>
          )}
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
