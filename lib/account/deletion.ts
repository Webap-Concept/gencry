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
import { getAppSettings } from "@/lib/db/settings-queries";
import { sendAccountDeletionRequestedEmail } from "@/lib/email/templates/account-deletion-requested";
import { sendAccountDeletionOtpEmail } from "@/lib/email/templates/account-deletion-otp";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { eq } from "drizzle-orm";

/**
 * Default fallback per i giorni di grace tra richiesta utente e purge
 * fisico. L'admin può sovrascriverlo da `/admin/compliance/gdpr` (setting
 * `gdpr.deletion.grace_days`). Lasciato esportato per chi non può
 * leggere il DB (client components, costanti top-level).
 *
 * NB: il purge fisico è eseguito da un job pg_cron Supabase
 * (`soft-deleted-purge`, vedi `lib/cron/registry.ts`) hardcoded a 30
 * giorni — quindi se l'admin imposta es. 60, l'app comunica 60g all'utente
 * ma il purge avviene comunque a 30g. Per allineare davvero serve
 * aggiornare anche lo SQL del cron in Supabase. Inconsistenza nota,
 * tracciata nel TODO GDPR residuo.
 */
export const ACCOUNT_DELETION_GRACE_DAYS_DEFAULT = 30;

/** @deprecated usa `ACCOUNT_DELETION_GRACE_DAYS_DEFAULT` o
 *  `getDeletionGraceDays()` per il valore runtime. Lasciato per
 *  retro-compat dei caller esistenti. */
export const ACCOUNT_DELETION_GRACE_DAYS = ACCOUNT_DELETION_GRACE_DAYS_DEFAULT;

/**
 * Legge il grace period configurato dall'admin (`gdpr.deletion.grace_days`)
 * con fallback al default. Usare quando si è in contesto async server-side
 * e si vuole il valore aggiornato.
 */
export async function getDeletionGraceDays(): Promise<number> {
  try {
    const settings = await getAppSettings();
    const raw = settings["gdpr.deletion.grace_days"];
    const n = raw != null ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  } catch (err) {
    console.error("[account/deletion] reading grace_days setting failed:", err);
  }
  return ACCOUNT_DELETION_GRACE_DAYS_DEFAULT;
}

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
  locale?: Locale;
}): Promise<DeletionResult> {
  const {
    userId,
    email,
    firstName,
    currentPasswordHash,
    currentPassword,
    locale = DEFAULT_LOCALE,
  } = params;

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

  await performDeletion({ userId, email, firstName, locale });
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
  locale?: Locale;
}): Promise<DeletionResult> {
  const { userId, email, firstName, locale = DEFAULT_LOCALE } = params;

  const code = await createVerificationCode(userId, "account_deletion");
  try {
    await sendAccountDeletionOtpEmail({
      toEmail: email,
      firstName,
      code,
      locale,
    });
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
  locale?: Locale;
}): Promise<DeletionResult> {
  const { userId, email, firstName, code, locale = DEFAULT_LOCALE } = params;

  const result = await verifyOtpCode(userId, code, "account_deletion");
  if (!result.success) {
    return {
      ok: false,
      error: result.error ?? "Codice di verifica non valido.",
    };
  }

  await performDeletion({ userId, email, firstName, locale });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Effetti comuni dopo verifica positiva (qualunque sia il path)
// ---------------------------------------------------------------------------

async function performDeletion(params: {
  userId: string;
  email: string;
  firstName: string | null;
  locale: Locale;
}): Promise<void> {
  const { userId, email, firstName, locale } = params;
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
    const graceDays = await getDeletionGraceDays();
    const purgeDate = new Date(
      now.getTime() + graceDays * 24 * 60 * 60 * 1000,
    );
    await sendAccountDeletionRequestedEmail({
      toEmail: email,
      firstName,
      purgeDate,
      locale,
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
 * deletedAt è settato e ricade nei N giorni di grace. Oltre la grace,
 * l'account è considerato definitivamente eliminato (anche se il purge
 * fisico arriverà solo col cron).
 *
 * `graceDays` opzionale: passare il valore runtime (`getDeletionGraceDays()`)
 * dove possibile per riflettere la setting admin. Senza, usa il default
 * 30 — è una funzione sync usata da middleware/UI dove async non è
 * sempre disponibile, e accettiamo il drift quando admin cambia setting.
 */
export function isDeletionPending(
  deletedAt: Date | null,
  graceDays: number = ACCOUNT_DELETION_GRACE_DAYS_DEFAULT,
): boolean {
  if (!deletedAt) return false;
  const graceEnd =
    deletedAt.getTime() + graceDays * 24 * 60 * 60 * 1000;
  return graceEnd > Date.now();
}
