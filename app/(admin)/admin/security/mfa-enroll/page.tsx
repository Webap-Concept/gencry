// app/(admin)/admin/security/mfa-enroll/page.tsx
//
// Pagina di enrollment MFA per lo staff (single source of truth in
// contesto admin). Il guard del layout `(admin)/layout.tsx` redirige qui
// quando la policy entra in blocking, e il layout `(protected)` fa lo
// stesso quando l'utente è isAdmin (così non finisce su /settings/security).
//
// Tutti i componenti UI sono admin-themed (token --admin-*) — niente
// import dai route group (protected)/(login). Le SERVER ACTIONS che
// implementano start/confirm/disable/regenerate sono invece riusate da
// `(protected)/settings/security/actions.ts`: sono business logic, non
// hanno CSS, single source of truth.

import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { AdminMfaPolicyBanner } from "./_components/admin-mfa-policy-banner";
import { AdminMfaSection } from "./_components/admin-mfa-section";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Verifica a due fattori" };
}

export const dynamic = "force-dynamic";

export default async function AdminMfaEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const user = await requireAdminPage();

  const [mfaState, policy, params] = await Promise.all([
    getMfaState(user.id),
    getMfaPolicy(),
    searchParams,
  ]);

  const enforcement = mfaEnforcement(user, policy, mfaState);
  const forcedRedirect = params.reason === "mfa-required";

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ShieldCheck}
        breadcrumbLabel="Sicurezza"
        title="Verifica a due fattori"
        subtitle="Attiva l'autenticazione a due fattori sul tuo account staff."
      />

      <AdminMfaPolicyBanner
        enforcement={enforcement}
        forcedRedirect={forcedRedirect}
      />

      <AdminMfaSection initialState={mfaState} />
    </div>
  );
}
