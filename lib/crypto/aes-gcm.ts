// lib/crypto/aes-gcm.ts
//
// Cifratura simmetrica AES-256-GCM per secret a riposo (es. il secret TOTP
// in user_mfa_totp). GCM dà autenticazione integrata (auth tag): un
// ciphertext o iv manomesso fa fallire `decipher.final()` con un'eccezione,
// quindi il decrypt rileva il tampering.
//
// API:
//   - encryptStringRaw / decryptStringRaw: prendono la chiave esplicita
//     (testabili direttamente)
//   - encryptSecret / decryptSecret: leggono MFA_ENCRYPTION_KEY dall'env
//     (32 byte base64 — vedi .env.example)
//
// Output: tutti e tre i campi (ciphertext, iv, tag) come base64 — comodi
// da salvare in colonne `text` Postgres senza preoccuparsi di bytea.

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM raccomanda 96-bit IV
const TAG_BYTES = 16;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[aes-gcm] key must be ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
}

export function encryptStringRaw(plain: string, key: Buffer): EncryptedPayload {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptStringRaw(
  payload: EncryptedPayload,
  key: Buffer,
): string {
  assertKey(key);
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error(`[aes-gcm] iv must be ${IV_BYTES} bytes`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`[aes-gcm] tag must be ${TAG_BYTES} bytes`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

let _cachedMfaKey: Buffer | null = null;

function getMfaEncryptionKey(): Buffer {
  if (_cachedMfaKey) return _cachedMfaKey;
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("[aes-gcm] MFA_ENCRYPTION_KEY env not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[aes-gcm] MFA_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }
  _cachedMfaKey = key;
  return key;
}

export function encryptSecret(plain: string): EncryptedPayload {
  return encryptStringRaw(plain, getMfaEncryptionKey());
}

export function decryptSecret(payload: EncryptedPayload): string {
  return decryptStringRaw(payload, getMfaEncryptionKey());
}
