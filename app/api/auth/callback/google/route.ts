// app/api/auth/callback/google/route.ts
// GET /api/auth/callback/google?code=...&state=...
//
// Pipeline:
//   1. blacklist IP
//   2. validazione query params (code, state)
//   3. token exchange + userinfo (handleGoogleCallback)
//   4. blacklist dominio email
//   5. canCreate = registrations_enabled
//   6. findOrCreateOAuthUser → ok | blocked | error
//   7. ban check
//   8. maintenance check (solo non-admin)
//   9. log SIGN_IN se utente esistente (SIGN_UP loggato dentro findOrCreateOAuthUser)
//  10. crea sessione
//  11. redirect: /onboarding se incompleto, altrimenti / o /admin

import { isDomainBlacklisted, isIpBlacklisted } from "@/lib/auth/blacklist";
import { handleGoogleCallback } from "@/lib/auth/oauth/google";
import { findOrCreateOAuthUser } from "@/lib/auth/oauth/index";
import { createVerificationCode } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import {
  addTrustedDevice,
  checkDeviceTrust,
  generateDeviceToken,
  getDeviceToken,
  setDeviceTokenCookie,
  setPendingAuthCookie,
} from "@/lib/auth/trusted-device";
import { setPendingMfaCookie } from "@/lib/auth/mfa/pending-cookie";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { bypassOnboardingIfNeeded, isOnboardingRequired } from "@/lib/auth/onboarding-gate";
import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { sendDeviceVerificationEmail } from "@/lib/email/templates/device-verification";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function redirect(path: string) {
  return NextResponse.redirect(new URL(path, APP_URL));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Google ha rifiutato (es. utente ha premuto Annulla)
  if (error)             return redirect("/sign-in?error=oauth_denied");
  if (!code || !state)   return redirect("/sign-in?error=oauth_invalid");

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  if (await isIpBlacklisted(ip)) {
    return redirect("/sign-in?error=blocked");
  }

  try {
    const { user: googleUser, tokens } = await handleGoogleCallback(code, state);

    if (await isDomainBlacklisted(googleUser.email)) {
      return redirect("/sign-in?error=oauth_domain_blocked");
    }

    const settings = await getAppSettings();
    const canCreate = settings.registrations_enabled !== "false";

    const result = await findOrCreateOAuthUser(
      {
        provider:          "google",
        providerAccountId: googleUser.sub,
        email:             googleUser.email,
        emailVerified:     googleUser.email_verified,
        firstName:         googleUser.given_name ?? null,
        lastName:          googleUser.family_name ?? null,
        picture:           googleUser.picture     ?? null,
        tokens,
        ipAddress:         ip,
        userAgent:         headersList.get("user-agent") ?? undefined,
      },
      { canCreate },
    );

    if (result.status === "blocked") {
      return redirect("/sign-in?error=registrations_disabled");
    }
    if (result.status === "error") {
      return redirect("/sign-in?error=oauth_user_failed");
    }

    const { user: dbUser, created } = result;

    if (dbUser.bannedAt) {
      return redirect("/sign-in?error=banned");
    }

    if (dbUser.deletedAt) {
      return redirect("/sign-in?error=account_deleted");
    }

    if (dbUser.role !== "admin" && settings.maintenance_mode === "true") {
      return redirect("/sign-in?error=maintenance");
    }

    const ua = headersList.get("user-agent") ?? undefined;

    if (created) {
      // Nuovo utente: auto-trust il primo dispositivo, nessuna verifica richiesta
      const newToken = generateDeviceToken();
      await addTrustedDevice(dbUser.id, newToken, ua);
      await setDeviceTokenCookie(newToken);
      await createSession(dbUser.id, dbUser.role);
      if (await isOnboardingRequired(dbUser)) {
        return redirect("/onboarding");
      }
      await bypassOnboardingIfNeeded(dbUser);
      return redirect("/");
    }

    // SIGN_UP è già loggato in findOrCreateOAuthUser; qui logghiamo SIGN_IN
    // per gli utenti esistenti (login OAuth oppure linking di un nuovo provider
    // a un account email pre-esistente).
    await db.insert(activityLogs).values({
      userId:    dbUser.id,
      action:    ActivityType.SIGN_IN,
      ipAddress: ip,
    });

    const deviceToken = await getDeviceToken();
    const { trusted, isFirstDevice } = await checkDeviceTrust(dbUser.id, deviceToken);

    if (trusted) {
      if (isFirstDevice) {
        const newToken = generateDeviceToken();
        await addTrustedDevice(dbUser.id, newToken, ua);
        await setDeviceTokenCookie(newToken);
      }

      // MFA gate: se attiva, sospendi la sessione e passa al challenge.
      // Per i nuovi account OAuth (`created`) saltiamo perché non possono
      // ancora avere MFA configurata.
      const mfaState = await getMfaState(dbUser.id);
      if (mfaState.enabled) {
        await setPendingMfaCookie(dbUser.id, dbUser.role);
        return redirect("/sign-in/mfa");
      }

      await createSession(dbUser.id, dbUser.role);
      // Onboarding gate: utenti non-admin con onboarding incompleto vengono
      // rimandati al wizard (es. abbandono dopo signup OAuth).
      // L'admin può disabilitare globalmente il wizard via /admin/settings/signup;
      // in quel caso `bypassOnboardingIfNeeded` chiude il profilo.
      if (await isOnboardingRequired(dbUser)) {
        return redirect("/onboarding");
      }
      await bypassOnboardingIfNeeded(dbUser);
      // OAuth Google è flusso pubblico: redirect sempre a "/". Gli admin
      // si autenticano via /<adminSlug>/sign-in (password + MFA), non via
      // OAuth — se un giorno serve OAuth admin, sarà una feature dedicata.
      return redirect("/");
    }

    // Dispositivo non riconosciuto: OTP via email
    const otpCode = await createVerificationCode(dbUser.id, "device_verification");
    try {
      await sendDeviceVerificationEmail(dbUser.email, otpCode);
    } catch (err) {
      console.error("[auth/callback/google] sendDeviceVerificationEmail failed:", err);
    }
    await setPendingAuthCookie(dbUser.id, dbUser.role);
    return redirect("/verify-device");
  } catch (err) {
    console.error("[auth/callback/google] error:", err);
    return redirect("/sign-in?error=oauth_failed");
  }
}
