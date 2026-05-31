import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { NotificationsUnreadProvider } from "@/components/modules/notifications/NotificationsUnreadProvider";
import { NotificationsBadgePill } from "@/components/modules/notifications/NotificationsBadgePill";
import { getUnreadNotificationsCount } from "@/lib/modules/notifications/queries";
import { RewardsBalanceProvider } from "@/components/modules/rewards/RewardsBalanceProvider";
import { CheckinToastLauncher } from "@/components/modules/rewards/CheckinToastLauncher";
import { claimDailyCheckin } from "@/lib/modules/rewards/earn-reward";
import { getUserBalance } from "@/lib/modules/rewards/queries";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { ImpersonationBanner } from "./_components/impersonation-banner";
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
import "@/app/(cms)/frontend.css";

const MFA_SECURITY_PATH = "/settings/security";

// Shell dell'area loggata: sidebar a sinistra (md+), feed centrale, right
// rail a destra (lg+); su mobile la nav passa al bottom-nav. I guest non
// vedono lo shell — la landing è full-screen autonoma.

export default async function Layout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Parallel slot per le modali intercepting routes (es. @modal/(.)post/[id]).
  // Quando l'URL non matcha nessuna route nello slot, viene renderizzato
  // @modal/default.tsx (return null). Vedi project_post_modal_intercepting_routes.
  modal: React.ReactNode;
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
    // accedere a (cms)/(login).
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
        <ImpersonationBanner />
      </Suspense>
      <Suspense fallback={null}>
        <PolicyReconsentSlot userId={session.user.id} />
      </Suspense>
    </>
  );

  // Count unread + rewards in parallelo: nessuno blocca l'altro.
  // checkin + balance in parallelo — se il checkin è appena avvenuto,
  // compensiamo manualmente l'amount nel balance iniziale.
  const userId = session.user.id;
  const [unreadCount, checkinResult, balanceRow] = await Promise.all([
    getUnreadNotificationsCount(userId),
    claimDailyCheckin(),
    getUserBalance(userId),
  ]);

  // Compensa la race condition: se la balance query era già partita
  // prima che il trigger DB aggiornasse rewards_balances, sommiamo l'amount.
  const initialBalance =
    (balanceRow?.balance ?? 0) +
    (checkinResult.awarded ? checkinResult.amount : 0);

  return (
    <RewardsBalanceProvider viewerUserId={userId} initialBalance={initialBalance}>
      <CheckinToastLauncher
        awarded={checkinResult.awarded}
        amount={checkinResult.amount}
      />
      <NotificationsUnreadProvider viewerUserId={userId} initialCount={unreadCount}>
        <ProtectedShell
          appLogoUrl={appSettings.app_logo_url}
          appLogoVariantUrl={appSettings.app_logo_variant_url}
          banner={banner}
          notificationsBadge={<NotificationsBadgePill />}
          notificationsBadgeMobile={<NotificationsBadgePill />}
        >
          <Suspense fallback={null}>{children}</Suspense>
          {modal}
        </ProtectedShell>
      </NotificationsUnreadProvider>
    </RewardsBalanceProvider>
  );
}
