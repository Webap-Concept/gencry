// app/(login)/verify-device/actions.ts
"use server";

import { validatedAction } from "@/lib/auth/middleware";
import { createVerificationCode, verifyOtpCode } from "@/lib/auth/otp";
import {
  checkGeneralRateLimit,
  recordGeneralAttempt,
} from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import {
  addTrustedDevice,
  clearPendingAuthCookie,
  generateDeviceToken,
  getPendingAuth,
  setDeviceTokenCookie,
  setPendingAuthCookie,
} from "@/lib/auth/trusted-device";
import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { sendDeviceVerificationEmail } from "@/lib/email/templates/device-verification";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

// Max 3 re-invii ogni 10 minuti per userId
const RESEND_MAX = 3;
const RESEND_WINDOW_SECONDS = 10 * 60;

// ─── Verifica codice OTP dispositivo ───────────────────────────────────────

const verifySchema = z.object({
  code: z.string().length(6, "Il codice deve essere di 6 cifre"),
});

export const verifyDevice = validatedAction(verifySchema, async (data) => {
  const pending = await getPendingAuth();
  if (!pending) {
    return { error: "Sessione scaduta. Accedi di nuovo." };
  }

  const { userId, role } = pending;

  const result = await verifyOtpCode(userId, data.code, "device_verification");
  if (!result.success) {
    return { error: result.error };
  }

  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? undefined;
  const newToken = generateDeviceToken();

  await addTrustedDevice(userId, newToken, ua);
  await setDeviceTokenCookie(newToken);
  await clearPendingAuthCookie();
  await createSession(userId, role);

  await db.insert(activityLogs).values({
    userId,
    action: ActivityType.DEVICE_VERIFIED,
  });

  // Onboarding gate per non-admin: leggiamo onboardingCompletedAt qui
  // (cookie pendingAuth non lo contiene). PK lookup, sul path raro della
  // verifica dispositivo: costo trascurabile.
  if (role !== "admin") {
    const [u] = await db
      .select({ onboardingCompletedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u?.onboardingCompletedAt) {
      redirect("/onboarding");
    }
  }

  redirect(role === "admin" ? "/admin" : "/");
});

// ─── Re-invio codice OTP ────────────────────────────────────────────────────

export const resendDeviceCode = validatedAction(z.object({}), async () => {
  const pending = await getPendingAuth();
  if (!pending) {
    return { error: "Sessione scaduta. Accedi di nuovo." };
  }

  const { userId, role } = pending;

  const rlKey = `device-otp-resend:${userId}`;
  const { blocked } = await checkGeneralRateLimit(rlKey, RESEND_MAX, RESEND_WINDOW_SECONDS);
  if (blocked) {
    return { error: "Hai richiesto troppi codici. Riprova tra qualche minuto." };
  }
  await recordGeneralAttempt(rlKey);

  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return { error: "Utente non trovato." };
  }

  const code = await createVerificationCode(userId, "device_verification");
  await sendDeviceVerificationEmail(row.email, code);

  // Rinnova il cookie pending per altri 10 minuti: l'utente ha una finestra
  // piena per inserire il codice appena ricevuto
  await setPendingAuthCookie(userId, role);

  return { success: "Codice inviato! Controlla la tua email." };
});
