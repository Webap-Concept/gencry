/**
 * Layout isolato per il frontend pubblico (pagine CMS gestite da admin).
 *
 * Si occupa del CSS specifico del frontend, monta header + right rail
 * (visibile su lg+) + footer pubblici. Il rail riusa lo stesso slot
 * registry del shell loggato per esporre adv/sponsor anche ai visitatori
 * non loggati, importante per la monetization. Gli snippet globali
 * (head/body_end) sono iniettati dal RootLayout in app/layout.tsx, che
 * è l'unico posto in cui next/script strategy="beforeInteractive" viene
 * hoistato nel <head> reale.
 */
import { AppRightRail } from "@/components/layout/AppRightRail";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Suspense } from "react";
import "./frontend.css";

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  const appSettings = await getAppSettingsSafe();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl flex">
          {/* main flex-1 + min-w-0 per non far esplodere il layout con
              content larghi (tabelle, code, immagini). Il children-wrapper
              resta `flex flex-col` come prima così pagine che vogliono
              stretchare lo sfondo a tutta l'altezza (404) possono usare
              `flex-1` sul proprio container. */}
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
