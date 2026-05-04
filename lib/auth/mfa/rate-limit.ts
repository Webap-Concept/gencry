// lib/auth/mfa/rate-limit.ts
//
// Rate limit per i tentativi di verifica TOTP / recovery code. Riusa
// `checkGeneralRateLimit` (DB-based) di lib/auth/rate-limit.ts: stessa
// soglia per entrambi i fattori, chiavi distinte per non incrociare i
// counter (un utente sotto attacco brute-force TOTP non vede bruciato
// anche il counter dei recovery code).

import "server-only";
import {
  checkGeneralRateLimit,
  recordGeneralAttempt,
} from "@/lib/auth/rate-limit";

export const MFA_VERIFY_MAX_ATTEMPTS = 5;
export const MFA_VERIFY_WINDOW_SECONDS = 15 * 60; // 15 min
export const MFA_VERIFY_LOCKOUT_SECONDS = 60 * 60; // 1 h informativo per UI

const KEY_TOTP = (userId: string) => `mfa-verify:${userId}`;
const KEY_RECOVERY = (userId: string) => `mfa-recovery:${userId}`;

export type MfaRateLimitResult = {
  blocked: boolean;
  remaining: number;
  lockoutSeconds: number;
};

async function check(key: string): Promise<MfaRateLimitResult> {
  const r = await checkGeneralRateLimit(
    key,
    MFA_VERIFY_MAX_ATTEMPTS,
    MFA_VERIFY_WINDOW_SECONDS,
  );
  return {
    blocked: r.blocked,
    remaining: r.remaining,
    lockoutSeconds: MFA_VERIFY_LOCKOUT_SECONDS,
  };
}

export async function checkMfaTotpRateLimit(
  userId: string,
): Promise<MfaRateLimitResult> {
  return check(KEY_TOTP(userId));
}

export async function recordMfaTotpAttempt(userId: string): Promise<void> {
  await recordGeneralAttempt(KEY_TOTP(userId));
}

export async function checkMfaRecoveryRateLimit(
  userId: string,
): Promise<MfaRateLimitResult> {
  return check(KEY_RECOVERY(userId));
}

export async function recordMfaRecoveryAttempt(userId: string): Promise<void> {
  await recordGeneralAttempt(KEY_RECOVERY(userId));
}
