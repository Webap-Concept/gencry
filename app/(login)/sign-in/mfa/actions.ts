// app/(login)/sign-in/mfa/actions.ts
"use server";

import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { validatedAction } from "@/lib/auth/middleware";
import {
  clearPendingMfaCookie,
  getPendingMfa,
} from "@/lib/auth/mfa/pending-cookie";
import {
  consumeRecoveryCode,
  verifyTotpForLogin,
} from "@/lib/auth/mfa/queries";
import {
  checkMfaRecoveryRateLimit,
  checkMfaTotpRateLimit,
  recordMfaRecoveryAttempt,
  recordMfaTotpAttempt,
} from "@/lib/auth/mfa/rate-limit";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Il form invia `code`: 6 cifre (TOTP) oppure 11 char `xxxxx-xxxxx` (recovery).
// Discriminiamo lato server con un check sul formato dopo trim.
const verifySchema = z.object({
  code: z.string().min(1, "Inserisci il codice."),
});

const TOTP_RE = /^\d{6}$/;
const RECOVERY_RE = /^[a-zA-Z0-9-\s]+$/;

export const verifyMfa = validatedAction(verifySchema, async (data) => {
  const t = await getTranslations("auth");
  const pending = await getPendingMfa();
  if (!pending) {
    return { error: t("actionErrors.mfa.sessionExpired") };
  }
  const { userId, role } = pending;

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const raw = data.code.trim();
  const isTotp = TOTP_RE.test(raw);

  // Path 1: codice TOTP a 6 cifre dall'app autenticatore.
  if (isTotp) {
    const rl = await checkMfaTotpRateLimit(userId);
    if (rl.blocked) {
      return {
        error: t("actionErrors.mfa.tooManyAttempts"),
      };
    }

    const result = await verifyTotpForLogin(userId, raw);
    if (!result.valid) {
      await recordMfaTotpAttempt(userId);
      return { error: t("actionErrors.mfa.invalidCode") };
    }

    await onMfaSuccess(userId, role, ip, ActivityType.MFA_VERIFIED);
    return await finishLogin(userId, role);
  }

  // Path 2: recovery code (xxxxx-xxxxx, lowercase, eventualmente con spazi).
  if (!RECOVERY_RE.test(raw)) {
    return { error: t("actionErrors.mfa.invalidFormat") };
  }

  const rl = await checkMfaRecoveryRateLimit(userId);
  if (rl.blocked) {
    return {
      error: t("actionErrors.mfa.tooManyAttempts"),
    };
  }

  const result = await consumeRecoveryCode(userId, raw);
  if (!result.ok) {
    await recordMfaRecoveryAttempt(userId);
    return { error: t("actionErrors.mfa.invalidCode") };
  }

  await onMfaSuccess(userId, role, ip, ActivityType.MFA_RECOVERY_CODE_USED);
  return await finishLogin(userId, role);
});

async function onMfaSuccess(
  userId: string,
  _role: string,
  ip: string,
  activity: ActivityType,
) {
  await db.insert(activityLogs).values({
    userId,
    action: activity,
    ipAddress: ip,
  });
}

async function finishLogin(userId: string, role: string): Promise<never> {
  await createSession(userId, role);
  await clearPendingMfaCookie();

  // Onboarding gate per non-admin (analogo a verify-device).
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
}
