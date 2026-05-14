import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { getSession } from "@/lib/auth/session";
import { getUser } from "@/lib/db/queries";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PolicyReconsentSlot } from "./_components/policy-reconsent-slot";
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

  // MFA enforcement: solo dentro (protected). Le pagine `(public)`
  // viste da utente loggato NON enforciano MFA — l'enforcement scatta
  // quando l'utente entra in un'area gated. `redirect()` throw-a una
  // Next-internal exception, deve restare FUORI dal try/catch.
  let mfaRedirectTo: string | null = null;
  const appSettings = await getAppSettingsSafe();
  try {
    const [user, policy, mfaState] = await Promise.all([
      getUser(),
      getMfaPolicy(),
      getMfaState(session.user.id),
    ]);
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
    console.error("[layout/protected] MFA check failed:", err);
  }
  if (mfaRedirectTo) {
    redirect(mfaRedirectTo);
  }

  const banner = (
    <>
      <PageShowRevalidator />
      <Suspense fallback={null}>
        <PolicyReconsentSlot userId={session.user.id} />
      </Suspense>
    </>
  );

  return (
    <ProtectedShell appLogoUrl={appSettings.app_logo_url} banner={banner}>
      <Suspense fallback={null}>{children}</Suspense>
    </ProtectedShell>
  );
}
