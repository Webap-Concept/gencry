// app/(login)/verify-email/actions.ts
"use server";

import { validatedAction } from "@/lib/auth/middleware";
import { createVerificationCode, verifyOtpCode } from "@/lib/auth/otp";
import { setSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { users, userProfiles } from "@/lib/db/schema";
import { sendSignupVerificationEmail } from "@/lib/email/templates/signup-verification";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

// UUID v4 regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helper ────────────────────────────────────────────────────
async function getPendingUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("pending_verification_user_id")?.value;
  if (!raw || !UUID_REGEX.test(raw)) return null;
  return raw;
}

// ─── Verifica codice OTP ────────────────────────────────────────
const verifySchema = z.object({
  code: z.string().length(6, "Il codice deve essere di 6 cifre"),
});

export const verifyEmail = validatedAction(verifySchema, async (data) => {
  const userId = await getPendingUserId();
  if (!userId) {
    return { error: "Sessione scaduta. Registrati di nuovo." };
  }

  const result = await verifyOtpCode(userId, data.code);
  if (!result.success) {
    return { error: result.error };
  }

  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, userId))
    .returning();

  const cookieStore = await cookies();
  cookieStore.delete("pending_verification_user_id");

  await setSession(user);
  // Allinea form signup al flusso OAuth: dopo la verifica OTP indirizza
  // al wizard di onboarding finché non è completato. Il guard in
  // app/(onboarding)/layout.tsx evita comunque il loop per utenti già fatti.
  redirect(user.onboardingCompletedAt ? "/" : "/onboarding");
});

// ─── Re-invio codice ────────────────────────────────────────────
export const resendVerificationEmail = validatedAction(
  z.object({}),
  async () => {
    const userId = await getPendingUserId();
    if (!userId) {
      return { error: "Sessione scaduta. Registrati di nuovo." };
    }

    const [row] = await db
      .select({
        email: users.email,
        firstName: userProfiles.firstName,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      return { error: "Utente non trovato." };
    }

    const code = await createVerificationCode(userId);
    await sendSignupVerificationEmail(
      row.email,
      code,
      row.firstName ?? undefined,
    );

    return { success: "Codice inviato! Controlla la tua email." };
  },
);
