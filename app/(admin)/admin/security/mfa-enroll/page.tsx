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
//
// NOTA: il banner di policy (warning/blocking) NON è renderizzato qui:
// `(admin)/layout.tsx` lo mostra shell-wide su ogni pagina admin quando
// l'enforcement è non-ok (incluso questa pagina, senza CTA "Vai al setup"
// dato che l'utente è già qui). Single banner, niente duplicati.

import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { AdminMfaSection } from "./_components/admin-mfa-section";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Verifica a due fattori" };
}

export const dynamic = "force-dynamic";

export default async function AdminMfaEnrollPage() {
  const user = await requireAdminPage();
  const mfaState = await getMfaState(user.id);

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ShieldCheck}
        breadcrumbLabel="Sicurezza"
        title="Verifica a due fattori"
        subtitle="Attiva l'autenticazione a due fattori sul tuo account staff."
      />

      <AdminMfaSection initialState={mfaState} />
    </div>
  );
}
