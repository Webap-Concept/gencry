"use server";

// Server Action invocata dal form pubblico in components/landing-page.tsx.
// Flusso:
//  1. Validazione formato email
//  2. Rate limit per IP (10 submit / 10min)
//  3. Anti-disposable
//  4. Insert ON CONFLICT DO NOTHING (idempotente)
//  5. Email di conferma inviata SOLO se la riga e' stata effettivamente
//     inserita — evita di re-spammare chi clicca due volte

import { db } from "@/lib/db/drizzle";
import { waitingList } from "@/lib/db/schema";
import { isDisposableDomain } from "@/lib/auth/disposable-domains";
import {
  checkGeneralRateLimit,
  recordGeneralAttempt,
} from "@/lib/auth/rate-limit";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendWaitingListEmail } from "@/lib/email/templates/waiting-list";
import { headers } from "next/headers";

export type WaitingListResult =
  | { ok: true; alreadySubscribed: boolean; message: string }
  | { ok: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

export async function joinWaitingListAction(
  emailRaw: string,
): Promise<WaitingListResult> {
  const email = emailRaw.trim().toLowerCase();

  // 1. Formato
  if (!email) {
    return { ok: false, error: "Inserisci la tua email." };
  }
  if (email.length > 255 || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "L'email non sembra valida." };
  }

  // Header per rate limit + audit. headers() puo' fallire al di fuori di
  // un request scope (test): in quel caso usiamo "unknown".
  const h = await headers().catch(() => null);
  const ip =
    h?.get("x-forwarded-for")?.split(",")[0].trim() ??
    h?.get("x-real-ip") ??
    "unknown";
  const userAgent = h?.get("user-agent") ?? null;

  // 2. Rate limit per IP (anti-bot a basso costo)
  const rl = await checkGeneralRateLimit(
    `waitlist:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (rl.blocked) {
    return {
      ok: false,
      error: "Troppi tentativi dal tuo IP. Riprova tra qualche minuto.",
    };
  }

  // 3. Anti-disposable (stessa lista usata in signup)
  if (await isDisposableDomain(email)) {
    return {
      ok: false,
      error: "Per la waiting list serve un'email non temporanea.",
    };
  }

  // 4. Insert con dedup. .returning() ci dice se la riga e' nuova.
  let inserted: { id: string }[];
  try {
    inserted = await db
      .insert(waitingList)
      .values({ email, ipAddress: ip === "unknown" ? null : ip, userAgent })
      .onConflictDoNothing({ target: waitingList.email })
      .returning({ id: waitingList.id });
  } catch (e) {
    console.error("[waitingList] insert failed:", e);
    return { ok: false, error: "Errore tecnico. Riprova tra poco." };
  }

  // Conta il tentativo (anche se duplicato): rate limit usa anche
  // i no-op come segnale di traffico anomalo.
  await recordGeneralAttempt(`waitlist:${ip}`).catch(() => {});

  const alreadySubscribed = inserted.length === 0;

  // 5. Email di conferma SOLO al primo inserimento.
  if (!alreadySubscribed) {
    try {
      const locale = await resolveRecipientLocale(null);
      await sendWaitingListEmail(email, locale);
    } catch (e) {
      // Non blocchiamo l'utente: l'iscrizione e' salva, l'email e' best-effort.
      console.warn("[waitingList] email send failed:", e);
    }
  }

  return {
    ok: true,
    alreadySubscribed,
    message: alreadySubscribed
      ? "Sei gia' nella lista. Ci sentiamo presto."
      : "Sei dentro. Controlla la tua casella per la conferma.",
  };
}
