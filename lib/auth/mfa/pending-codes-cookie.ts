// lib/auth/mfa/pending-codes-cookie.ts
//
// Cookie temporaneo per consegnare i recovery codes appena generati al
// browser dell'utente DOPO un setup/regenerate riuscito, senza farli
// viaggiare nello state di una server action.
//
// Why a cookie and not action state:
//   `confirmMfaSetupAction` / `regenerateRecoveryCodesAction` ritornavano
//   i codici dentro l'ActionState. Quel return value viene consegnato dal
//   server al client come parte dello stream di risposta dell'action,
//   intercalato (in Next 16) col re-render RSC innescato da `updateTag`.
//   Se la fase di re-render incespica (cold start, slow Supabase,
//   timeout), lo stream si rompe: la TRANSAZIONE è già committata server
//   side (MFA enabled), ma il client non riceve mai i codici. Refresh →
//   utente vede stato enabled ma SENZA recovery codes. Disastro: i codici
//   sono l'unica difesa se perde il telefono.
//
// Soluzione: l'action mette i codici in un cookie firmato (10 min TTL,
// httpOnly, signed con AUTH_SECRET) e fa redirect a una page dedicata
// `<context>/codes`. La page legge il cookie in server component e
// renderizza i codici. Robusto: se il browser si stacca dopo il redirect,
// basta rifare la URL — il cookie persiste per 10 min, i codici si
// ripescano. Niente state intermedio, niente race con la revalidation.
//
// Stesso pattern di `pending-cookie.ts` (challenge MFA al login).

import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "pending_recovery_codes";
const EXPIRY_MS = 10 * 60 * 1000; // 10 minuti

const key = new TextEncoder().encode(process.env.AUTH_SECRET);

export type PendingRecoveryCodesContext = "setup" | "regenerate";

type Payload = {
  codes: string[];
  context: PendingRecoveryCodesContext;
  expires: string;
};

export async function setPendingRecoveryCodesCookie(
  codes: string[],
  context: PendingRecoveryCodesContext,
): Promise<void> {
  const expires = new Date(Date.now() + EXPIRY_MS);
  const payload: Payload = {
    codes,
    context,
    expires: expires.toISOString(),
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10 minutes")
    .sign(key);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires,
    path: "/",
  });
}

/** Lettura non-distruttiva del cookie. Usato dalle pages /codes per
 *  renderizzare i codici. La cancellazione avviene quando l'utente
 *  conferma di averli salvati (form submit → ack action). */
export async function getPendingRecoveryCodes(): Promise<{
  codes: string[];
  context: PendingRecoveryCodesContext;
} | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const data = payload as unknown as Payload;
    if (new Date() > new Date(data.expires)) return null;
    return { codes: data.codes, context: data.context };
  } catch {
    return null;
  }
}

export async function clearPendingRecoveryCodesCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
