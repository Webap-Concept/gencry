// app/(admin)/admin/sign-in/mfa/page.tsx
//
// Challenge MFA dedicato al flusso admin. Riusa la stessa server action
// `verifyMfa` del flusso pubblico — la differenza sta nel cookie
// `pending_mfa_auth` (context: "admin") che fa sì che il redirect post-
// verifica torni a `/<adminSlug>` invece che a `/`.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { getPendingMfa } from "@/lib/auth/mfa/pending-cookie";
import { getSession } from "@/lib/auth/session";
import { AdminMfaChallengeForm } from "./_components/mfa-form";

export const metadata: Metadata = { title: "Verifica in due fattori" };

export default async function AdminMfaChallengePage() {
  const slug = await getAdminUrlSlug();

  const session = await getSession();
  if (session) {
    // Già loggato: torna al pannello admin.
    redirect(`/${slug}`);
  }

  const pending = await getPendingMfa();
  if (!pending || pending.context !== "admin") {
    // Nessun challenge admin in corso: rimanda alla sign-in admin.
    redirect(`/${slug}/sign-in`);
  }

  return <AdminMfaChallengeForm />;
}
