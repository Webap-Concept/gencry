// app/(admin)/admin/layout.tsx
// Layout principale per tutto /admin/*.
// Importa il CSS admin e applica il guard RBAC a tutte le route
// TRANNE /admin/sign-in — per evitare il redirect loop.
import "@/app/(admin)/admin.css";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getNavOrderOverrides } from "@/lib/db/admin-nav-order-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getUserPermissions } from "@/lib/rbac/can";
import { runGeneratorsThrottled } from "@/lib/notifications/dispatcher";
import { getInitialBellData } from "@/lib/notifications/queries";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSlugProvider } from "./_components/admin-slug-context";
import AdminShellClient from "./_components/admin-shell-client";
import AdminHeaderRight from "./_components/header";
import { AdminMfaPolicyBanner } from "./security/mfa-enroll/_components/admin-mfa-policy-banner";
import type { MfaEnforcement } from "@/lib/auth/mfa/policy";

// Template metadata: ogni page.tsx esporta solo il titolo specifico
// es. export const metadata = { title: "Utenti" }
// risultato nel tab: "Utenti | Admin"
export const metadata: Metadata = {
  title: {
    template: "%s | Admin",
    default: "Admin",
  },
};

async function AdminShell({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const adminSlug = await getAdminUrlSlug();

  // La sign-in admin (e il challenge MFA che la segue) non deve essere
  // protetta — è la pagina di login stessa, l'utente non ha ancora una
  // sessione valida. Match sul path PUBBLICO (proxy.ts setta x-pathname
  // al path utente, non a quello rewriteato).
  const signInRoot = `/${adminSlug}/sign-in`;
  if (pathname === signInRoot || pathname.startsWith(`${signInRoot}/`)) {
    return <AdminSlugProvider value={adminSlug}>{children}</AdminSlugProvider>;
  }

  const [settings, user] = await Promise.all([
    getAppSettings(),
    requireAdminPage(),
  ]);

  // MFA enforcement (admin context):
  //  - blocking + non-enroll page → redirect a /<slug>/security/mfa-enroll
  //  - blocking + enroll page    → niente redirect (siamo già lì), ma
  //    mostra il banner shell-wide
  //  - warning                    → mostra il banner shell-wide (con CTA
  //    "Vai al setup" se non siamo già sull'enroll)
  //  - ok                         → niente
  // Bypass solo per /api/* (server actions/route handlers — niente UI).
  // Il banner è single source of truth: non lo duplichiamo dentro
  // mfa-enroll/page.tsx — vive solo qui nel layout. Try/catch difensivo:
  // errori transitori non bloccano l'admin.
  const enrollPath = `/${adminSlug}/security/mfa-enroll`;
  const isOnEnrollPage = pathname === enrollPath;
  let mfaRedirectTo: string | null = null;
  let mfaEnforcementForBanner: MfaEnforcement | null = null;
  if (!user.bannedAt && !pathname.startsWith("/api/")) {
    try {
      const [policy, mfaState] = await Promise.all([
        getMfaPolicy(),
        getMfaState(user.id),
      ]);
      const enforcement = mfaEnforcement(user, policy, mfaState);
      if (enforcement.kind === "blocking" && !isOnEnrollPage) {
        mfaRedirectTo = `${enrollPath}?reason=mfa-required`;
      } else if (enforcement.kind !== "ok") {
        mfaEnforcementForBanner = enforcement;
      }
    } catch (err) {
      console.error("[layout/admin] MFA enforcement check failed:", err);
    }
  }
  if (mfaRedirectTo) {
    redirect(mfaRedirectTo);
  }

  const appName = settings.app_name?.trim() || "App";

  // Locale dell'admin staff: priorità a `users.locale` (preferenza
  // esplicita salvata in /settings/profile in PR-6). Fallback al guess
  // del proxy (header x-locale già propagato dal root layout). Quando
  // PR-6 popolerà users.locale via UI, questo override prenderà effetto
  // automaticamente per tutti gli admin loggati.
  const userLocale =
    user.locale && isLocale(user.locale)
      ? user.locale
      : (() => {
          const headerLocale = headersList.get("x-locale");
          return headerLocale && isLocale(headerLocale)
            ? headerLocale
            : DEFAULT_LOCALE;
        })();

  // setRequestLocale + getMessages per servire i message giusti ai
  // Server Components di /admin/*. Il NextIntlClientProvider qui sotto
  // è annidato dentro quello del root layout — i Client Components di
  // /admin/* trovano questo provider per primo (più "vicino") quindi
  // useTranslations risolve dai message dell'admin staff.
  setRequestLocale(userLocale);
  const messages = await getMessages();

  // Carica i permessi in batch (una sola query) per passarli alla sidebar
  // I super admin (isAdmin=true) ricevono un Set vuoto — la sidebar
  // li tratta come "ha tutto" tramite il flag separato
  const userPermissions = user.isAdmin
    ? new Set<string>(["__superadmin__"])
    : await getUserPermissions(user);

  // Build-time short-circuit: durante `next build` Next esegue il layout
  // per ogni page admin nella fase "Generating static pages" anche se
  // tutte le route admin sono dynamic (ƒ). Non c'è una sessione reale,
  // quindi `runGeneratorsThrottled` + `getInitialBellData` +
  // `getNavOrderOverrides` farebbero query DB inutili (≈60s in totale
  // su un build con DB Supabase EU). Le pagine reali ricevono comunque
  // i dati freschi al primo render in produzione.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (!isBuild) {
    await runGeneratorsThrottled();
  }
  const [bell, navOrder] = isBuild
    ? [
        { notifications: [], unreadCount: 0 } as Awaited<
          ReturnType<typeof getInitialBellData>
        >,
        {} as Awaited<ReturnType<typeof getNavOrderOverrides>>,
      ]
    : await Promise.all([
        getInitialBellData(),
        getNavOrderOverrides(),
      ]);

  return (
    <NextIntlClientProvider locale={userLocale} messages={messages}>
      <AdminSlugProvider value={adminSlug}>
        <AdminShellClient
          appName={appName}
          userPermissions={[...userPermissions]}
          isSuperAdmin={user.isAdmin === true}
          navOrder={navOrder}
          header={
            <AdminHeaderRight
              user={user}
              notifications={bell.notifications}
              unreadCount={bell.unreadCount}
            />
          }>
          {mfaEnforcementForBanner && (
            <div className="mb-4">
              <AdminMfaPolicyBanner
                enforcement={mfaEnforcementForBanner}
                enrollHref={isOnEnrollPage ? undefined : enrollPath}
              />
            </div>
          )}
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-32">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
                />
              </div>
            }>
            {children}
          </Suspense>
        </AdminShellClient>
      </AdminSlugProvider>
    </NextIntlClientProvider>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-screen items-center justify-center"
          style={{ background: "var(--admin-page-bg)" }}>
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
          />
        </div>
      }>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
