import { AppBottomNav } from "@/components/layout/AppBottomNav";
import { AppRightRail } from "@/components/layout/AppRightRail";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { getPendingReconsents } from "@/lib/account/policy-reconsent";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { getSession } from "@/lib/auth/session";
import { getUser } from "@/lib/db/queries";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import type { PolicyNotificationKey } from "@/lib/db/schema";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PolicyReconsentBanner } from "./_components/policy-reconsent-banner";
import "@/app/(frontend)/frontend.css";

const MFA_SECURITY_PATH = "/settings/security";

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

  // MFA enforcement + re-consent banner. Both are independent reads on
  // the layout's critical path; running them in parallel saves one
  // round-trip per page load. Wrapped in a single try/catch so a DB
  // hiccup in either path degrades gracefully (no MFA redirect, no
  // banner) instead of crashing the whole logged-in area.
  //
  // Behavior note: previously a `getPendingReconsents` failure would
  // throw out of the layout (500). Now it's caught here and treated as
  // "no pending reconsent" — strictly safer.
  //
  // `redirect()` for MFA is computed inside the try and called OUTSIDE
  // it, because `redirect()` throws a Next-internal exception we must
  // not swallow.
  const emptyReconsent = {
    items: [] as Awaited<ReturnType<typeof getPendingReconsents>>["items"],
    oldestEnqueuedAt: null as Date | null,
    graceMs: 0,
  };
  let mfaRedirectTo: string | null = null;
  let reconsent: Awaited<ReturnType<typeof getPendingReconsents>> = emptyReconsent;
  try {
    const [user, policy, mfaState, reconsentResult] = await Promise.all([
      getUser(),
      getMfaPolicy(),
      getMfaState(session.user.id),
      getPendingReconsents(session.user.id),
    ]);
    reconsent = reconsentResult;

    if (user && !user.bannedAt) {
      const enforcement = mfaEnforcement(user, policy, mfaState);
      if (enforcement.kind === "blocking") {
        const pathname = (await headers()).get("x-pathname") ?? "";
        const isStaff = user.isAdmin === true;
        const adminSlug = isStaff ? await getAdminUrlSlug() : null;
        const targetPath = isStaff && adminSlug
          ? `/${adminSlug}/security/mfa-enroll`
          : MFA_SECURITY_PATH;
        const bypassPaths = [targetPath, "/api/"];
        const bypass = bypassPaths.some((p) => pathname.startsWith(p));
        if (!bypass) {
          mfaRedirectTo = `${targetPath}?reason=mfa-required`;
        }
      }
    }
  } catch (err) {
    console.error("[layout/protected] enforcement/reconsent check failed:", err);
  }
  if (mfaRedirectTo) {
    redirect(mfaRedirectTo);
  }

  // Re-consent banner: appare se l'utente ha policy obsolete e l'admin ha
  // attivato gdpr.policy.force_reconsent_on_change. Modalità bloccante
  // dopo gdpr.policy.reconsent_grace_days giorni dal bump.
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
    // `gc-app-shell`: marker per scope-are le regole `.gc-dark` del tema bosco.
    // Le definizioni in frontend.css sono `.gc-dark .gc-app-shell { --gc-*: ... }`
    // → un utente loggato in bosco vede il tema scuro SOLO dentro questo layout.
    // La landing pubblica, /sign-in, le CMS pages restano sempre in sabbia
    // anche se html.gc-dark è attiva (vedi UserMenu/ThemeToggleItem).
    <div className="gc-app-shell min-h-dvh bg-gc-bg">
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
