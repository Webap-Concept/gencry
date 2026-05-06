// lib/account/email-change.ts
//
// Cambio email in 2 step:
//   1. requestEmailChange: re-auth con password, controlli su nuova email
//      (formato, dominio non disposable, non in uso da altri, diversa
//      dalla corrente), salva users.pendingEmail + invia OTP al NUOVO
//      indirizzo. Rate-limit: 1 richiesta ogni 24h (anche dopo cancel).
//   2. confirmEmailChange: verifica OTP, swap email, clear pendingEmail.
//      Il timestamp pendingEmailRequestedAt resta per il rate-limit.
//
// La sessione resta valida (il JWT contiene userId+role, non email),
// quindi l'utente continua a essere loggato con la nuova email.

import { addEmailToBloom, checkEmailAvailability, ensureBloomFilter } from "@/lib/bloom/bloom-filter";
import { isDomainBlacklisted } from "@/lib/auth/blacklist";
import { isUniqueConstraintError } from "@/lib/auth/race-condition";
import { comparePasswords } from "@/lib/auth/session";
import { revokeAllUserSessions } from "@/lib/auth/sessions";
import { createVerificationCode, verifyOtpCode } from "@/lib/auth/otp";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  emailVerifications,
  users,
} from "@/lib/db/schema";
import { sendEmailChangeVerificationEmail } from "@/lib/email/templates/email-change-verification";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { and, eq } from "drizzle-orm";

const RATE_LIMIT_HOURS = 24;

export type EmailChangeRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export type EmailChangeConfirmResult =
  | { ok: true; newEmail: string; revokedOtherSessions: number }
  | { ok: false; error: string };

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function withinRateLimit(lastRequestedAt: Date | null): boolean {
  if (!lastRequestedAt) return false;
  const elapsedMs = Date.now() - lastRequestedAt.getTime();
  return elapsedMs < RATE_LIMIT_HOURS * 60 * 60 * 1000;
}

export async function requestEmailChange(params: {
  userId: string;
  currentEmail: string;
  currentPasswordHash: string | null;
  currentPendingEmail: string | null;
  pendingEmailRequestedAt: Date | null;
  firstName: string | null;
  password: string;
  newEmail: string;
  locale?: Locale;
}): Promise<EmailChangeRequestResult> {
  const {
    userId,
    currentEmail,
    currentPasswordHash,
    currentPendingEmail,
    pendingEmailRequestedAt,
    firstName,
    password,
    newEmail,
    locale = DEFAULT_LOCALE,
  } = params;

  // 1. Re-auth (no password set → solo OAuth → non può cambiare email qui)
  if (currentPasswordHash === null) {
    return {
      ok: false,
      error:
        "Il tuo account non ha una password (accesso solo via Google). Cambia l'email direttamente dal provider Google.",
    };
  }
  const valid = await comparePasswords(password, currentPasswordHash);
  if (!valid) {
    return { ok: false, error: "La password non è corretta." };
  }

  // 2. Già una richiesta in corso?
  if (currentPendingEmail) {
    return {
      ok: false,
      error:
        "Hai già una richiesta di cambio email in attesa. Conferma il codice o annullala prima di richiederne un'altra.",
    };
  }

  // 3. Rate-limit (1/24h, anche dopo cancel/confirm)
  if (withinRateLimit(pendingEmailRequestedAt)) {
    return {
      ok: false,
      error:
        "Hai già richiesto un cambio email nelle ultime 24 ore. Riprova domani.",
    };
  }

  const normalized = normalize(newEmail);

  // 4. Stesso indirizzo
  if (normalized === currentEmail.toLowerCase()) {
    return { ok: false, error: "La nuova email coincide con quella attuale." };
  }

  // 5. Dominio non disposable
  if (await isDomainBlacklisted(normalized)) {
    return { ok: false, error: "Dominio email non consentito." };
  }

  // 6. Disponibilità (bloom + DB)
  await ensureBloomFilter();
  const availability = await checkEmailAvailability(normalized);
  if (!availability.available) {
    return { ok: false, error: "Questa email è già associata a un altro account." };
  }

  // 7. Salva pendingEmail + genera OTP + invia
  const now = new Date();
  try {
    await db
      .update(users)
      .set({
        pendingEmail: normalized,
        pendingEmailRequestedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Vincolo unique potrebbe arrivare in futuro su pendingEmail.
      // Per ora non c'è, ma copriamo lo scenario.
      return { ok: false, error: "Questa email è già in uso." };
    }
    throw err;
  }

  const code = await createVerificationCode(userId, "email_change");
  await sendEmailChangeVerificationEmail(
    normalized,
    code,
    firstName ?? undefined,
    locale,
  );

  // L'evento EMAIL_CHANGED viene loggato solo allo swap effettivo
  // (confirmEmailChange), non alla richiesta.

  return { ok: true };
}

export async function confirmEmailChange(params: {
  userId: string;
  pendingEmail: string | null;
  code: string;
  /** Sessione corrente da preservare quando revochiamo le altre. */
  currentSessionId?: string;
}): Promise<EmailChangeConfirmResult> {
  const { userId, pendingEmail, code, currentSessionId } = params;

  if (!pendingEmail) {
    return {
      ok: false,
      error: "Nessun cambio email in attesa. Richiedilo prima di confermare.",
    };
  }

  const result = await verifyOtpCode(userId, code, "email_change");
  if (!result.success) {
    return { ok: false, error: result.error ?? "Codice non valido." };
  }

  // Swap email + clear pendingEmail. Mantiene pendingEmailRequestedAt
  // perché il rate-limit deve valere anche dopo conferma.
  try {
    await db
      .update(users)
      .set({
        email: pendingEmail,
        pendingEmail: null,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Tra invio OTP e conferma, qualcun altro ha registrato la stessa
      // email. Eliminiamo la pending e segnaliamo l'errore.
      await db
        .update(users)
        .set({ pendingEmail: null })
        .where(eq(users.id, userId));
      return {
        ok: false,
        error: "Questa email è stata appena registrata da un altro utente.",
      };
    }
    throw err;
  }

  // Best-effort: aggiorna il bloom (rimozione vecchia non supportata, OK)
  try {
    await addEmailToBloom(pendingEmail);
  } catch (err) {
    console.error("[email-change] addEmailToBloom failed:", err);
  }

  await db.insert(activityLogs).values({
    userId,
    action: ActivityType.EMAIL_CHANGED,
    ipAddress: "",
  });

  // Cambio email = evento di sicurezza: kicka tutte le altre sessioni.
  // Coerente col cambio password.
  const { revokedCount } = await revokeAllUserSessions({
    userId,
    exceptSessionId: currentSessionId,
  });

  return { ok: true, newEmail: pendingEmail, revokedOtherSessions: revokedCount };
}

export async function cancelEmailChange(userId: string): Promise<void> {
  // Cancel azzera solo pendingEmail. pendingEmailRequestedAt resta per
  // il rate-limit: 1/giorno vale anche dopo l'annullamento.
  await db
    .update(users)
    .set({ pendingEmail: null })
    .where(eq(users.id, userId));

  // Pulisci l'OTP pendente
  await db
    .delete(emailVerifications)
    .where(
      and(
        eq(emailVerifications.userId, userId),
        eq(emailVerifications.type, "email_change"),
      ),
    );
}
