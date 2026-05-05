import { AppBottomNav } from "@/components/layout/AppBottomNav";
import { AppRightRail } from "@/components/layout/AppRightRail";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { getPendingReconsents } from "@/lib/account/policy-reconsent";
import { getSession } from "@/lib/auth/session";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import type { PolicyNotificationKey } from "@/lib/db/schema";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Suspense } from "react";
import { PolicyReconsentBanner } from "./_components/policy-reconsent-banner";

// Shell dell'area loggata: sidebar a sinistra (md+), feed centrale, right
// rail a destra (lg+); su mobile la nav passa al bottom-nav. I guest non
// vedono lo shell — la landing è full-screen autonoma.

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PR-1b: locale dall'header x-locale (cookie/Accept-Language/default).
  // PR-5 sovrascriverà con users.locale per l'utente loggato.
  await setRequestLocaleFromHeaders();
  const session = await getSession();
  const isGuest = !session;

  if (isGuest) {
    // Guest sulla `/` → landing coming-soon. Niente shell loggata, ma
    // includiamo il footer pubblico così visitatori anonimi hanno accesso
    // ai link legali e al bottone "Preferenze cookie" senza dover
    // accedere a (frontend)/(login).
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <div className="flex-1">{children}</div>
        <Suspense fallback={null}>
          <PublicFooter />
        </Suspense>
      </div>
    );
  }

  // Re-consent banner: appare se l'utente ha policy obsolete e l'admin ha
  // attivato gdpr.policy.force_reconsent_on_change. Modalità bloccante
  // dopo gdpr.policy.reconsent_grace_days giorni dal bump.
  const reconsent = await getPendingReconsents(session.user.id);
  const slugsRaw = reconsent.items.length > 0 ? await getSystemPageSlugs() : {};
  const slugs: Partial<Record<PolicyNotificationKey, string>> = {
    terms: slugsRaw.terms,
    privacy: slugsRaw.privacy,
    marketing: slugsRaw.marketing,
  };

  let bannerMode: "banner" | "blocking" = "banner";
  let daysRemaining: number | null = null;
  if (reconsent.oldestEnqueuedAt) {
    const elapsed = Date.now() - reconsent.oldestEnqueuedAt.getTime();
    if (elapsed >= reconsent.graceMs) {
      bannerMode = "blocking";
      daysRemaining = 0;
    } else {
      daysRemaining = Math.max(
        0,
        Math.ceil((reconsent.graceMs - elapsed) / (24 * 60 * 60 * 1000)),
      );
    }
  }

  return (
    <div className="min-h-dvh bg-gc-bg">
      <PageShowRevalidator />
      {reconsent.items.length > 0 && (
        <PolicyReconsentBanner
          items={reconsent.items.map((i) => ({
            policyKey: i.policyKey,
            newVersion: i.newVersion,
            acceptedVersion: i.acceptedVersion,
          }))}
          slugs={slugs}
          mode={bannerMode}
          daysRemaining={daysRemaining}
        />
      )}
      <AppTopBar />
      <div className="mx-auto max-w-[1440px] flex">
        <AppSidebar />
        <main className="flex-1 min-w-0 pb-20 md:pb-6">
          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </main>
        <AppRightRail />
      </div>
      <AppBottomNav />
    </div>
  );
}
