// lib/auth/mfa/totp.ts
//
// Generazione e verifica codici TOTP (RFC 6238) tramite `otpauth`.
// Funzioni "pure": prendono il secret in chiaro come argomento — il
// decrypt dal DB lo fa il chiamante (queries.ts). Questo le rende
// testabili con i test vector RFC senza mock.

import "server-only";
import { Secret, TOTP, URI } from "otpauth";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ALGORITHM = "SHA1";
/** Tolleranza ±1 step (= ±30s) per coprire skew orologio dell'utente. */
export const TOTP_VERIFY_WINDOW = 1;

/** Genera un secret TOTP sicuro (160 bit) e lo ritorna come base32. */
export function generateTotpSecretBase32(): string {
  return new Secret({ size: 20 }).base32;
}

/**
 * Costruisce l'URL `otpauth://totp/...` da mostrare nel QR code.
 * `label` è ciò che l'utente vede nell'app autenticatore (es. la sua email).
 */
export function buildOtpauthUrl(args: {
  secretBase32: string;
  label: string;
  issuer: string;
}): string {
  const totp = new TOTP({
    issuer: args.issuer,
    label: args.label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(args.secretBase32),
  });
  return URI.stringify(totp);
}

/** Codice TOTP corrente (per test e per il flow di setup-confirm). */
export function getCurrentTotpCode(secretBase32: string, at?: Date): string {
  const totp = new TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate({ timestamp: at?.getTime() });
}

export type VerifyTotpResult =
  | { valid: false; reason: "invalid" | "replay" }
  | { valid: true; counter: number };

/**
 * Verifica un codice TOTP con tolleranza ±1 step.
 *
 * Replay-prevention: se il counter del codice accettato è <= lastUsedCounter
 * (passato dal chiamante), il codice viene rifiutato. Il chiamante deve poi
 * persistere `counter` come nuovo `last_used_counter` per la prossima verifica.
 */
export function verifyTotpToken(args: {
  secretBase32: string;
  token: string;
  lastUsedCounter?: number | null;
  at?: Date;
  digits?: number;
}): VerifyTotpResult {
  const totp = new TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: args.digits ?? TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(args.secretBase32),
  });

  const timestamp = args.at?.getTime() ?? Date.now();
  const delta = totp.validate({
    token: args.token,
    timestamp,
    window: TOTP_VERIFY_WINDOW,
  });

  if (delta === null) return { valid: false, reason: "invalid" };

  // Step (counter) corrispondente al codice accettato.
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS) + delta;

  if (
    args.lastUsedCounter !== null &&
    args.lastUsedCounter !== undefined &&
    counter <= args.lastUsedCounter
  ) {
    return { valid: false, reason: "replay" };
  }

  return { valid: true, counter };
}
