// app/(admin)/admin/layout.tsx
// Layout principale per tutto /admin/*.
// Importa il CSS admin e applica il guard RBAC a tutte le route
// TRANNE /admin/sign-in — per evitare il redirect loop.
import "@/app/(admin)/admin.css";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getNavOrderOverrides } from "@/lib/db/admin-nav-order-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getUserPermissions } from "@/lib/rbac/can";
import { runGeneratorsThrottled } from "@/lib/notifications/dispatcher";
import { getInitialBellData } from "@/lib/notifications/queries";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Suspense } from "react";
import type { Metadata } from "next";
import AdminShellClient from "./_components/admin-shell-client";
import AdminHeaderRight from "./_components/header";

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

  // /admin/sign-in non deve essere protetta — è la pagina di login stessa
  if (pathname === "/admin/sign-in") {
    return <>{children}</>;
  }

  const [settings, user] = await Promise.all([
    getAppSettings(),
    requireAdminPage(),
  ]);

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

  // Throttled (max 1/h): garantisce che le notifiche derivate
  // siano in stato corrente senza un cron esterno.
  await runGeneratorsThrottled();
  const [bell, navOrder] = await Promise.all([
    getInitialBellData(userPermissions),
    getNavOrderOverrides(),
  ]);

  return (
    <NextIntlClientProvider locale={userLocale} messages={messages}>
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
