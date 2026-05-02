// lib/account/deletion.ts
//
// Logica di eliminazione account: l'utente richiede la cancellazione,
// noi NON eliminiamo subito i dati (compliance + grace period). Settiamo
// users.deletedAt = now() e dopo 30 giorni un cron Supabase fa il purge
// fisico via cascade DELETE. Durante la grace, i tentativi di login sono
// respinti con messaggio che invita a contattare l'assistenza.
//
// Due path di re-auth a seconda del tipo di account:
// - **password**: utenti email+password fanno re-auth con la password
//   corrente (`requestAccountDeletion`)
// - **OTP via email**: utenti OAuth-only (no password locale) richiedono
//   un OTP a 6 cifre via email e lo confermano (`sendAccountDeletionOtp`
//   + `requestAccountDeletionViaOtp`). Stesso effetto finale.

import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { comparePasswords } from "@/lib/auth/session";
import { createVerificationCode, verifyOtpCode } from "@/lib/auth/otp";
import { sendAccountDeletionRequestedEmail } from "@/lib/email/templates/account-deletion-requested";
import { sendAccountDeletionOtpEmail } from "@/lib/email/templates/account-deletion-otp";
import { eq } from "drizzle-orm";

/** Giorni di grace tra richiesta utente e purge fisico. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export type DeletionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Path 1: password re-auth (utenti email+password)
// ---------------------------------------------------------------------------

/**
 * Setta users.deletedAt = now() dopo aver verificato la password.
 * Per utenti OAuth-only senza password locale ritorna errore: usare
 * il flusso OTP via email (`requestAccountDeletionViaOtp`).
 *
 * Il caller è responsabile di clearare il cookie di sessione subito dopo.
 *
 * `email`/`firstName` servono per l'email di conferma post-richiesta;
 * l'invio è best-effort, errori loggati ma non rilanciati.
 */
export async function requestAccountDeletion(params: {
  userId: string;
  email: string;
  firstName: string | null;
  currentPasswordHash: string | null;
  currentPassword: string;
}): Promise<DeletionResult> {
  const { userId, email, firstName, currentPasswordHash, currentPassword } =
    params;

  if (currentPasswordHash === null) {
    return {
      ok: false,
      error:
        "Il tuo account è collegato a Google e non ha una password locale. Usa il flusso di verifica via email.",
    };
  }

  const valid = await comparePasswords(currentPassword, currentPasswordHash);
  if (!valid) {
    return { ok: false, error: "La password non è corretta." };
  }

  await performDeletion({ userId, email, firstName });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Path 2: OTP via email (utenti OAuth-only)
// ---------------------------------------------------------------------------

/**
 * Genera un OTP a 6 cifre e lo manda all'email dell'utente. Da chiamare
 * quando l'utente clicca "Richiedi codice" nel flusso OAuth-only.
 * Sovrascrive un eventuale OTP precedente dello stesso tipo.
 */
export async function sendAccountDeletionOtp(params: {
  userId: string;
  email: string;
  firstName: string | null;
}): Promise<DeletionResult> {
  const { userId, email, firstName } = params;

  const code = await createVerificationCode(userId, "account_deletion");
  try {
    await sendAccountDeletionOtpEmail({ toEmail: email, firstName, code });
  } catch (err) {
    console.error("[account/deletion] OTP email send failed:", err);
    return {
      ok: false,
      error:
        "Impossibile inviare il codice di verifica. Riprova tra qualche minuto.",
    };
  }

  return { ok: true };
}

/**
 * Verifica l'OTP e procede con la deletion. Da usare nel flusso OAuth-only
 * dopo che l'utente ha inserito il codice ricevuto via email.
 */
export async function requestAccountDeletionViaOtp(params: {
  userId: string;
  email: string;
  firstName: string | null;
  code: string;
}): Promise<DeletionResult> {
  const { userId, email, firstName, code } = params;

  const result = await verifyOtpCode(userId, code, "account_deletion");
  if (!result.success) {
    return {
      ok: false,
      error: result.error ?? "Codice di verifica non valido.",
    };
  }

  await performDeletion({ userId, email, firstName });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Effetti comuni dopo verifica positiva (qualunque sia il path)
// ---------------------------------------------------------------------------

async function performDeletion(params: {
  userId: string;
  email: string;
  firstName: string | null;
}): Promise<void> {
  const { userId, email, firstName } = params;
  const now = new Date();

  await Promise.all([
    db
      .update(users)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(users.id, userId)),
    db.insert(activityLogs).values({
      userId,
      action: ActivityType.DELETE_ACCOUNT,
      ipAddress: "",
    }),
  ]);

  try {
    const purgeDate = new Date(
      now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    await sendAccountDeletionRequestedEmail({
      toEmail: email,
      firstName,
      purgeDate,
    });
  } catch (err) {
    console.error("[account/deletion] confirmation email failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Helper esposto a UI/middleware
// ---------------------------------------------------------------------------

/**
 * Ritorna true se l'utente è in stato di eliminazione richiesta — cioè
 * deletedAt è settato e ricade nei `ACCOUNT_DELETION_GRACE_DAYS` giorni
 * di grace. Oltre la grace, l'account è considerato definitivamente
 * eliminato (anche se il purge fisico arriverà solo col cron).
 */
export function isDeletionPending(deletedAt: Date | null): boolean {
  if (!deletedAt) return false;
  const graceEnd =
    deletedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return graceEnd > Date.now();
}
