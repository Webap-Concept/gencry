// lib/account/deletion.ts
//
// Logica di eliminazione account: l'utente richiede la cancellazione,
// noi NON eliminiamo subito i dati (compliance + grace period). Settiamo
// users.deletedAt = now() e dopo 30 giorni un cron Supabase (out-of-scope
// in questa PR) farà il purge fisico via cascade DELETE.
// Durante la grace, i tentativi di login sono respinti con un messaggio
// che invita a contattare l'assistenza per annullare. La cancellazione
// volontaria via UI da parte dell'utente non è esposta — l'auth richiede
// la password e la sessione viene clearata: niente UI di "ripensaci"
// recuperabile dall'utente da solo.

import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { comparePasswords } from "@/lib/auth/session";
import { sendAccountDeletionRequestedEmail } from "@/lib/email/templates/account-deletion-requested";
import { eq } from "drizzle-orm";

/** Giorni di grace tra richiesta utente e purge fisico. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export type DeletionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Setta users.deletedAt = now() dopo aver verificato la password.
 * Da chiamare DOPO aver re-autenticato l'utente: il caller è responsabile
 * di clearare il cookie di sessione subito dopo (la sessione esistente
 * resterebbe valida fino a scadenza JWT, ma getUser filtra deletedAt).
 *
 * `email`/`firstName` servono per inviare l'email di conferma post-richiesta;
 * l'invio è best-effort — se Resend fallisce, la deletion è già registrata
 * in DB e la richiesta utente non deve fallire per questo.
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

  // OAuth-only: l'utente non ha password locale → non possiamo verificarlo
  // qui. Caso edge che gestiamo restituendo un errore esplicito; in futuro
  // serve un flusso "conferma via email" o "conferma via Google" alternativo.
  if (currentPasswordHash === null) {
    return {
      ok: false,
      error:
        "Il tuo account è collegato a Google e non ha una password locale. Per eliminare l'account contatta l'assistenza.",
    };
  }

  const valid = await comparePasswords(currentPassword, currentPasswordHash);
  if (!valid) {
    return { ok: false, error: "La password non è corretta." };
  }

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

  // Email di conferma all'utente. Best-effort: errori loggati ma non
  // rilanciati — la deletion è il "fatto reale", la mail è cortesia.
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

  return { ok: true };
}

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
