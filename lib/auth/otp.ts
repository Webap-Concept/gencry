// lib/auth/otp.ts
import { db } from "@/lib/db/drizzle";
import { emailVerifications } from "@/lib/db/schema";
import { randomInt } from "crypto";
import { and, eq, sql } from "drizzle-orm";

/** Massimo numero di tentativi OTP falliti prima di invalidare il codice. */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpType =
  | "email_verification"
  | "device_verification"
  | "email_change"
  | "account_deletion";

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999)); // 6 cifre sicure
}

export async function createVerificationCode(
  userId: string,
  type: OtpType = "email_verification",
): Promise<string> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minuti

  // Rimuovi eventuali codici precedenti dello stesso tipo
  await db
    .delete(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.type, type),
      ),
    );

  await db.insert(emailVerifications).values({ userId, code, expiresAt, attempts: 0, type });
  return code;
}

/**
 * Codici di errore i18n-friendly. I caller mappano questi codici alle
 * stringhe localizzate (chiave `auth.validation.otp.<code>`) — la lib
 * non conosce il locale del request.
 */
export type OtpErrorCode = "notFound" | "expired" | "wrong";

export type VerifyOtpResult =
  | { success: true }
  | { success: false; errorCode: OtpErrorCode };

export async function verifyOtpCode(
  userId: string,
  inputCode: string,
  type: OtpType = "email_verification",
): Promise<VerifyOtpResult> {
  const [record] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.type, type),
      ),
    )
    .limit(1);

  if (!record) return { success: false, errorCode: "notFound" };

  // Troppi tentativi falliti: il record va considerato bruciato
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await db
      .delete(emailVerifications)
      .where(
        and(
          eq(emailVerifications.userId, userId),
          eq(emailVerifications.type, type),
        ),
      );
    return { success: false, errorCode: "notFound" };
  }

  if (new Date() > record.expiresAt)
    return { success: false, errorCode: "expired" };

  if (record.code !== inputCode) {
    // Incrementa il contatore dei tentativi falliti
    await db
      .update(emailVerifications)
      .set({ attempts: sql`${emailVerifications.attempts} + 1` })
      .where(
        and(
          eq(emailVerifications.userId, userId),
          eq(emailVerifications.type, type),
        ),
      );
    return { success: false, errorCode: "wrong" };
  }

  // Codice valido → elimina il record
  await db
    .delete(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.type, type),
      ),
    );
  return { success: true };
}
