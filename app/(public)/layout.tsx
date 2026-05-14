/**
 * Layout adattivo per rotte pubbliche (SEO-friendly) che cambiano
 * presentazione in base allo stato utente.
 *
 *   - Loggato → riusa `ProtectedShell` (sidebar + topbar + bottom nav +
 *     right rail) così l'utente non perde la navigazione quando visita
 *     una pagina pubblica come `/coins/btc`.
 *   - Anonimo → header marketing (logo + Accedi / Iscriviti) +
 *     `AppRightRail` (su lg+ — riusa lo stesso slot registry del shell
 *     loggato così gli adv/sponsor montati nei rail.* slot sono visibili
 *     anche ai visitatori non loggati, importante per monetization) +
 *     footer pubblico.
 *
 * Le pagine dentro questo gruppo NON devono assumere lo stato utente:
 * fanno SSR sempre, branching condizionale dentro il loro corpo
 * (banner CTA per anonimi, azioni interattive per loggati).
 *
 * Niente MFA enforcement / re-consent banner qui: quelle protezioni
 * vivono in `(protected)/layout.tsx`. Per le pagine pubbliche del
 * social, le azioni gated (es. "aggiungi a watchlist") fanno il check
 * al momento del click — visualizzare il contenuto è sempre concesso.
 */
import { AppRightRail } from "@/components/layout/AppRightRail";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getSession } from "@/lib/auth/session";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Suspense } from "react";
import "@/app/(frontend)/frontend.css";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();

  // 1 read parallela: session + app settings. Niente getUser pesante:
  // ci basta sapere se siamo loggati o no per scegliere la shell.
  const [session, appSettings] = await Promise.all([
    getSession(),
    getAppSettingsSafe(),
  ]);

  if (session) {
    return (
      <ProtectedShell appLogoUrl={appSettings.app_logo_url}>
        <Suspense fallback={null}>{children}</Suspense>
      </ProtectedShell>
    );
  }

  // Layout anonimo: header + (content centrale + right rail su lg+) + footer.
  // Il rail flue con la pagina come nello shell loggato (una sola scrollbar).
  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-7xl flex">
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
            <Suspense fallback={null}>{children}</Suspense>
          </main>
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
