/**
 * Layout adattivo per rotte pubbliche (SEO-friendly) che cambiano
 * presentazione in base allo stato utente.
 *
 *   - Loggato → riusa `ProtectedShell` (sidebar + topbar + bottom nav)
 *     così l'utente non perde la navigazione quando visita una pagina
 *     pubblica come `/coins/btc`.
 *   - Anonimo → header marketing semplice (logo + Accedi / Iscriviti) +
 *     footer pubblico. Niente sidebar.
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
