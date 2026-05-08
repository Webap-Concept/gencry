// app/(protected)/settings/security/codes/page.tsx
//
// Page dedicata che mostra i recovery codes appena generati (setup
// iniziale o rigenerazione), letti da un cookie firmato che l'action
// scrive prima di redirigere qui. Vedi
// `lib/auth/mfa/pending-codes-cookie.ts` per il razionale del pattern.
//
// Se il cookie manca/scaduto → redirect a /settings/security: l'utente
// può rigenerare i codici da lì se li ha persi.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingRecoveryCodes } from "@/lib/auth/mfa/pending-codes-cookie";
import { getUser } from "@/lib/db/queries";
import { MfaRecoveryCodesDisplay } from "../_components/mfa-recovery-codes-display";

export const metadata: Metadata = { title: "Recovery codes" };

export const dynamic = "force-dynamic";

export default async function SecurityCodesPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const pending = await getPendingRecoveryCodes();
  if (!pending) {
    redirect("/settings/security");
  }

  return (
    <div className="space-y-6">
      <MfaRecoveryCodesDisplay codes={pending.codes} context={pending.context} />
    </div>
  );
}
