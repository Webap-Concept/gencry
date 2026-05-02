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

export async function verifyOtpCode(
  userId: string,
  inputCode: string,
  type: OtpType = "email_verification",
): Promise<{ success: boolean; error?: string }> {
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

  if (!record) return { success: false, error: "Codice non trovato." };

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
    return { success: false, error: "Codice non trovato." };
  }

  if (new Date() > record.expiresAt)
    return { success: false, error: "Codice scaduto." };

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
    return { success: false, error: "Codice non corretto." };
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
