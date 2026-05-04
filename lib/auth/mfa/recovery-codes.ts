// lib/auth/mfa/recovery-codes.ts
//
// 10 recovery codes monouso, generati al momento dell'attivazione MFA
// (e rigenerabili). Formato `xxxxx-xxxxx` con alfabeto base32 senza
// ambiguità (niente 0/O/1/I/L) per ridurre errori di trascrizione.
// Hashati con bcrypt (10 rounds, allineato a `hashPassword` in session.ts).
//
// Le funzioni di questo file sono pure (no DB). La persistenza vive
// in lib/auth/mfa/queries.ts.

import "server-only";
import { compare, hash } from "bcryptjs";
import { randomInt } from "node:crypto";

const SALT_ROUNDS = 10;

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_GROUP_LEN = 5;

// Alfabeto base32 "human-friendly": niente 0/O, 1/I/L per evitare
// confusione di trascrizione. 23 simboli = ~4.5 bit per char.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomChar(): string {
  return ALPHABET[randomInt(0, ALPHABET.length)]!;
}

function randomGroup(): string {
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_GROUP_LEN; i++) out += randomChar();
  return out;
}

/** Genera 10 recovery codes nuovi in formato `xxxxx-xxxxx` (lowercase). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(`${randomGroup()}-${randomGroup()}`);
  }
  return codes;
}

/**
 * Normalizza l'input dell'utente: trim, lowercase, rimuovi spazi e dash,
 * poi reinserisci il dash centrale. Tollera "ABCDE-FGHIJ", "abcdefghij",
 * "  abcde fghij  ", "abcde-fghij\n".
 */
export function normalizeRecoveryCode(input: string): string {
  const stripped = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
  if (stripped.length !== RECOVERY_CODE_GROUP_LEN * 2) return stripped;
  return `${stripped.slice(0, RECOVERY_CODE_GROUP_LEN)}-${stripped.slice(
    RECOVERY_CODE_GROUP_LEN,
  )}`;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return hash(code, SALT_ROUNDS);
}

export async function compareRecoveryCode(
  candidate: string,
  hashed: string,
): Promise<boolean> {
  return compare(candidate, hashed);
}
