import { Suspense } from "react";
import { PolicyReconsentSlot } from "@/app/(protected)/_components/policy-reconsent-slot";
import { AppRightRail } from "@/components/layout/AppRightRail";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import {
  TopCoinsBar,
  TopCoinsBarSkeleton,
} from "@/components/modules/coins/top-coins-bar";
import { NotificationsUnreadProvider } from "@/components/modules/notifications/NotificationsUnreadProvider";
import { NotificationsBadgePill } from "@/components/modules/notifications/NotificationsBadgePill";
import { getSession } from "@/lib/auth/session";
import { getUnreadNotificationsCount } from "@/lib/modules/notifications/queries";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { isModuleInstalled } from "@/lib/modules/registry";

/**
 * Shell adattivo per le rotte pubbliche SEO-friendly. Estratto dal
 * `(public)/layout.tsx` per essere applicato dalle SINGOLE page del
 * group, e non dal layout: così quando una page chiama `notFound()`
 * l'unwind raggiunge il root `app/not-found.tsx` senza essere wrappato
 * da questo shell — la 404 risulta full-page sia per loggati che per
 * anonimi.
 *
 *   - Loggato → riusa `ProtectedShell` (sidebar + topbar + bottom nav +
 *     right rail) così l'utente non perde la navigazione quando visita
 *     una pagina pubblica come `/coins/btc`.
 *   - Anonimo → header marketing (logo + Accedi / Iscriviti) +
 *     `AppRightRail` (su lg+) + footer pubblico.
 *
 * Niente MFA enforcement / re-consent gate qui: quelle protezioni
 * vivono in `(protected)/layout.tsx`. Per le pagine pubbliche del
 * social, le azioni gated (es. "aggiungi a watchlist") fanno il check
 * al momento del click — visualizzare il contenuto è sempre concesso.
 */
export async function PublicAdaptiveShell({
  children,
  rightRailExtra,
}: {
  children: React.ReactNode;
  /** Contenuto iniettato in cima alla right rail dello shell (sopra le
   *  slot home.rail.*). Propagato sia al ramo loggato (ProtectedShell)
   *  sia al ramo anonimo (AppRightRail diretto). */
  rightRailExtra?: React.ReactNode;
}) {
  // 1 read parallela: session + app settings. Niente getUser pesante:
  // ci basta sapere se siamo loggati o no per scegliere la shell.
  const [session, appSettings] = await Promise.all([
    getSession(),
    getAppSettingsSafe(),
  ]);

  if (session) {
    // Banner re-consent globale anche per le pagine pubbliche viste
    // dal loggato (vedi (protected)/layout.tsx per il path "vero" gated
    // con MFA enforcement — qui solo il banner UI, niente redirect).
    const banner = (
      <Suspense fallback={null}>
        <PolicyReconsentSlot userId={session.user.id} />
      </Suspense>
    );
    const unreadCount = await getUnreadNotificationsCount(session.user.id);

    // Monta il rewards shell (RewardsBalanceProvider + checkin) anche qui,
    // identico a (protected)/layout.tsx: senza, il UserMenu su una pagina del
    // group (public) — es. profilo /u/[username], coin page — non vedrebbe il
    // provider → useRewardsBalance() = null → il link "Coins" sparisce.
    const RewardsShell = isModuleInstalled("rewards")
      ? (await import("@/components/modules/rewards/rewards-layout-shell")).default
      : null;

    // Parità con (protected)/layout.tsx: stessa barra top-coin anche sulle
    // pagine pubbliche viste da loggato (es. /coins, /u/[username]).
    const marketBar = isModuleInstalled("prices") ? (
      <Suspense fallback={<TopCoinsBarSkeleton />}>
        <TopCoinsBar />
      </Suspense>
    ) : null;

    const shell = (
      <NotificationsUnreadProvider
        viewerUserId={session.user.id}
        initialCount={unreadCount}
      >
        <ProtectedShell
          appLogoUrl={appSettings.app_logo_url}
          appLogoVariantUrl={appSettings.app_logo_variant_url}
          banner={banner}
          marketBar={marketBar}
          notificationsBadge={<NotificationsBadgePill />}
          notificationsBadgeMobile={<NotificationsBadgePill />}
          rightRailExtra={rightRailExtra}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </ProtectedShell>
      </NotificationsUnreadProvider>
    );

    return RewardsShell ? (
      <RewardsShell userId={session.user.id}>{shell}</RewardsShell>
    ) : (
      shell
    );
  }

  // Layout anonimo: header + (content centrale + right rail su lg+) + footer.
  // Il rail flue con la pagina come nello shell loggato (una sola scrollbar).
  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader
        appLogoUrl={appSettings.app_logo_url}
        appLogoVariantUrl={appSettings.app_logo_variant_url}
      />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl flex">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
            <Suspense fallback={null}>{children}</Suspense>
          </main>
          <Suspense fallback={null}>
            <AppRightRail extra={rightRailExtra} />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
