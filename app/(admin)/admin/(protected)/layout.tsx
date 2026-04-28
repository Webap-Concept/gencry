// app/(admin)/admin/(protected)/layout.tsx
// Layout RBAC per tutte le pagine admin protette.
// Wrappa solo le route dentro (protected)/, NON /admin/sign-in.
import { requireAdminPage } from "@/lib/rbac/guards";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getUserPermissions } from "@/lib/rbac/can";
import { runGeneratorsThrottled } from "@/lib/notifications/dispatcher";
import { getInitialBellData } from "@/lib/notifications/queries";
import { Suspense } from "react";
import AdminShellClient from "../_components/admin-shell-client";
import AdminHeaderRight from "../_components/header";

async function AdminShell({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([
    getAppSettings(),
    requireAdminPage(),
  ]);

  const appName = settings.app_name?.trim() || "App";

  const userPermissions = user.isAdmin
    ? new Set<string>(["__superadmin__"])
    : await getUserPermissions(user);

  await runGeneratorsThrottled();
  const bell = await getInitialBellData(userPermissions);

  return (
    <AdminShellClient
      appName={appName}
      userPermissions={[...userPermissions]}
      isSuperAdmin={user.isAdmin === true}
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
  );
}

export default function AdminProtectedLayout({
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
