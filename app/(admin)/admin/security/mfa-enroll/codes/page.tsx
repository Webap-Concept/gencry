// app/(admin)/admin/security/mfa-enroll/codes/page.tsx
//
// Page admin dedicata che mostra i recovery codes appena generati,
// letti dal cookie firmato che l'action scrive prima di redirigere qui.
// Vedi `lib/auth/mfa/pending-codes-cookie.ts` per il razionale.
//
// Se il cookie manca/scaduto → redirect a /admin/security/mfa-enroll:
// l'utente può rigenerare i codici da lì se li ha persi.

import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getPendingRecoveryCodes } from "@/lib/auth/mfa/pending-codes-cookie";
import { requireAdminPage } from "@/lib/rbac/guards";
import { AdminMfaRecoveryCodesDisplay } from "../_components/admin-mfa-recovery-codes-display";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Recovery codes" };
}

export const dynamic = "force-dynamic";

export default async function AdminMfaCodesPage() {
  await requireAdminPage();

  const pending = await getPendingRecoveryCodes();
  if (!pending) {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/security/mfa-enroll`);
  }

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ShieldCheck}
        breadcrumbLabel="Sicurezza"
        title="Recovery codes"
        subtitle="Salvali ora — non potremo più mostrarteli."
      />

      <AdminMfaRecoveryCodesDisplay
        codes={pending.codes}
        context={pending.context}
      />
    </div>
  );
}
