// app/(login)/sign-in/mfa/page.tsx
//
// Guard: accessibile solo con cookie `pending_mfa_auth` valido, settato
// da signIn / verify-device / OAuth callback per gli utenti con MFA
// attiva. Senza cookie → /sign-in. Con sessione attiva → home.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingMfa } from "@/lib/auth/mfa/pending-cookie";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/db/settings-queries";
import { MfaChallengeForm } from "./_components/mfa-form";

export const metadata: Metadata = { title: "Verifica in due fattori" };

export default async function MfaChallengePage() {
  const session = await getSession();
  if (session) {
    redirect(session.user.role === "admin" ? "/admin" : "/");
  }

  const pending = await getPendingMfa();
  if (!pending) {
    redirect("/sign-in");
  }

  const settings = await getAppSettings();
  // Preferenza al logo "principale", fallback al variant — stessa logica usata
  // nelle email (resolveEmailLogoUrl). Niente env hardcoded.
  const logoUrl = settings.app_logo_url ?? settings.app_logo_variant_url;

  return (
    <MfaChallengeForm logoUrl={logoUrl} appName={settings.app_name} />
  );
}
