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
  appLogoVariantUrl,
  banner,
  marketBar,
  notificationsBadge,
  notificationsBadgeMobile,
  rightRailExtra,
  children,
}: {
  appLogoUrl: string | null;
  /** Logo per modalità dark — caricato in admin come `app_logo_variant_url`.
   *  Null → fallback al logo principale anche in dark. */
  appLogoVariantUrl?: string | null;
  /** Banner opzionale renderizzato sopra la topbar (es. re-consent). */
  banner?: React.ReactNode;
  /** Barra full-width fissa sotto la topbar (es. ticker top-coin del modulo
   *  prices). ReactNode così il core resta module-agnostic: lo inietta il
   *  layout chiamante, guardato da isModuleInstalled. */
  marketBar?: React.ReactNode;
  /** Server-rendered badge unread per la bell della sidebar (modulo
   *  notifications). Passato come ReactNode così rimane server-only
   *  pur essendo nested in un client component. */
  notificationsBadge?: React.ReactNode;
  /** Seconda istanza del badge per la bell del bottom nav mobile. Istanza
   *  separata (non lo stesso element di `notificationsBadge`) per evitare
   *  il re-uso dello stesso nodo React in due posizioni del DOM. */
  notificationsBadgeMobile?: React.ReactNode;
  /** Contenuto specifico-della-pagina iniettato in cima alla right rail
   *  (sopra le slot home.rail.*). Es.: profile page → coin più citate +
   *  follower preview dell'utente visualizzato. */
  rightRailExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="gc-app-shell h-dvh bg-gc-bg flex flex-col">
      {banner}
      <AppTopBar />
      {marketBar}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-[1280px] flex">
        <AppSidebar
          appLogoUrl={appLogoUrl}
          appLogoVariantUrl={appLogoVariantUrl}
          notificationsBadge={notificationsBadge}
        />
        <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-6">
          <div className="w-full mx-auto py-6 px-4">{children}</div>
        </main>
        <AppRightRail showLegalFooter extra={rightRailExtra} />
      </div>
      <AppBottomNav notificationsBadge={notificationsBadgeMobile} />
    </div>
  );
}
