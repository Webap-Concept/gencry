// app/(admin)/admin/security/mfa-enroll/page.tsx
//
// Pagina di enrollment MFA per lo staff. Single source of truth per
// l'attivazione personale dell'autenticazione a due fattori in contesto
// admin: il guard del layout (admin)/layout.tsx redirige qui quando la
// policy entra in blocking, e il layout (protected) fa lo stesso quando
// l'utente è isAdmin (così non finisce su /settings/security).
//
// Riusa le sub-section del flusso utente (MfaSection) — sono componenti
// transazionali, una piccola differenza di palette è accettabile e
// mantiene una sola fonte per la logica di setup/disable/regenerate.

import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { MfaPolicyBanner } from "@/app/(protected)/settings/security/_components/mfa-policy-banner";
import { MfaSection } from "@/app/(protected)/settings/security/_components/mfa-section";
import { getMfaPolicy, mfaEnforcement } from "@/lib/auth/mfa/policy";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { requireAdminPage } from "@/lib/rbac/guards";

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
    <div className="space-y-6">
      <AdminSectionHeader
        icon={ShieldCheck}
        breadcrumbLabel="Sicurezza"
        title="Verifica a due fattori"
        subtitle="Attiva l'autenticazione a due fattori sul tuo account staff."
      />

      <MfaPolicyBanner
        enforcement={enforcement}
        forcedRedirect={forcedRedirect}
      />

      <MfaSection initialState={mfaState} />
    </div>
  );
}
