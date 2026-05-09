// lib/auth/password-reset.ts
import { db } from "@/lib/db/drizzle";
import { passwordResetTokens } from "@/lib/db/schema";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

export async function createPasswordResetToken(
  userId: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex"); // 64 char hex
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minuti

  // Rimuovi token precedenti
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));

  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  return token;
}

/**
 * Codici di errore i18n-friendly. I caller mappano questi codici alle
 * stringhe localizzate (chiave `auth.validation.passwordReset.<code>`) —
 * la lib non conosce il locale del request.
 */
export type PasswordResetErrorCode = "invalid" | "expired";

export type VerifyPasswordResetResult =
  | { valid: true; userId: string }
  | { valid: false; errorCode: PasswordResetErrorCode };

/**
 * Verifica il token e lo elimina atomicamente se valido.
 * In questo modo il token non può essere riutilizzato anche se il chiamante
 * dimentica di invocare deletePasswordResetToken.
 */
export async function verifyPasswordResetToken(
  token: string,
): Promise<VerifyPasswordResetResult> {
  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (!record) return { valid: false, errorCode: "invalid" };
  if (new Date() > record.expiresAt)
    return { valid: false, errorCode: "expired" };

  // Token valido → eliminalo subito per impedire riuso
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token));

  return { valid: true, userId: record.userId };
}

/**
 * @deprecated Non necessaria: verifyPasswordResetToken elimina già il token.
 * Mantenuta per retrocompatibilità — rimuovere in un futuro cleanup.
 */
export async function deletePasswordResetToken(token: string): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token));
}
