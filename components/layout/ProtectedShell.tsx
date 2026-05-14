import { AppBottomNav } from "@/components/layout/AppBottomNav";
import { AppRightRail } from "@/components/layout/AppRightRail";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";

/**
 * Shell UI dell'area loggata (topbar + sidebar + main + right rail +
 * bottom nav). Estratto dal layout `(protected)` per essere riusato dai
 * layout adattivi (es. `(public)` quando l'utente è loggato).
 *
 * Pure UI: non fa query, riceve quello che serve come prop. Le logiche
 * di enforcement (MFA, re-consent, ecc.) restano nel layout chiamante.
 *
 * Class `gc-app-shell` è un marker structural (h-dvh layout pattern);
 * il theming dark si applica a livello html (`.gc-dark`).
 */
export function ProtectedShell({
  appLogoUrl,
  banner,
  children,
}: {
  appLogoUrl: string | null;
  /** Banner opzionale renderizzato sopra la topbar (es. re-consent). */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="gc-app-shell h-dvh bg-gc-bg flex flex-col">
      {banner}
      <AppTopBar />
      <div className="flex-1 min-h-0 mx-auto w-full max-w-[1440px] flex">
        <AppSidebar appLogoUrl={appLogoUrl} />
        <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-6">
          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
        <AppRightRail showLegalFooter />
      </div>
      <AppBottomNav />
    </div>
  );
}
