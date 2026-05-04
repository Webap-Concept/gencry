// lib/auth/mfa/pending-cookie.ts
//
// Cookie pending per il challenge MFA TOTP al login. Stesso pattern di
// `pending_device_auth` (lib/auth/trusted-device.ts): JWT firmato con
// AUTH_SECRET, scadenza 10 minuti, NON è una sessione valida — l'utente
// resta sloggato finché non supera il check TOTP.
//
// Cookie separato dal pending_device_auth perché i due flow sono
// sequenziali (device verification email → poi TOTP) e teniamo
// separati i concern: clearPendingAuth() si occupa del primo,
// clearPendingMfa() del secondo.

import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "pending_mfa_auth";
const EXPIRY_MS = 10 * 60 * 1000; // 10 minuti

const key = new TextEncoder().encode(process.env.AUTH_SECRET);

type PendingMfaPayload = {
  userId: string;
  role: string;
  expires: string;
};

export async function setPendingMfaCookie(
  userId: string,
  role: string,
): Promise<void> {
  const expires = new Date(Date.now() + EXPIRY_MS);
  const payload: PendingMfaPayload = {
    userId,
    role,
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

export async function getPendingMfa(): Promise<PendingMfaPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const data = payload as unknown as PendingMfaPayload;
    if (new Date() > new Date(data.expires)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function clearPendingMfaCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
