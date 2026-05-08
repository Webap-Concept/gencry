// lib/auth/mfa/queries.ts
//
// Domain layer dell'MFA TOTP: tutte le query DB + cifratura del secret.
// Nessuna UI / nessuna server-action qui — quelle vivono in
// app/(protected)/settings/security/actions.ts (PR 3) e
// app/(login)/sign-in/mfa/actions.ts (PR 4).

import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/drizzle";
import { mfaRecoveryCodes, userMfaTotp } from "@/lib/db/schema";
import {
  decryptSecret,
  encryptSecret,
  type EncryptedPayload,
} from "@/lib/crypto/aes-gcm";

/** Tag per `revalidateTag()` dopo enroll / disable / regenerate / admin
 * reset. Tag globale (non per-user) per semplicità: gli eventi MFA sono
 * rari e invalidare la cache di tutti gli utenti costa solo una query DB
 * di cache-miss alla loro prossima navigazione. Senza revalidate la
 * cache scade comunque ogni 60s. */
export const MFA_STATE_TAG = "mfa-state";
import {
  generateTotpSecretBase32,
  verifyTotpToken,
  type VerifyTotpResult,
} from "./totp";
import {
  RECOVERY_CODE_COUNT,
  compareRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery-codes";

// ---------------------------------------------------------------------------
// Read: stato MFA per UI
// ---------------------------------------------------------------------------

export type MfaState = {
  enabled: boolean;
  pendingSetup: boolean;
  enabledAt: Date | null;
  lastUsedAt: Date | null;
  recoveryCodesRemaining: number;
};

/**
 * Stato MFA di uno specifico utente. Letta dal `(protected)/layout.tsx`
 * a OGNI navigazione di area loggata (incluso frontend), quindi cachata
 * con `unstable_cache` 60s (tag MFA_STATE_TAG). userId è argomento della
 * funzione → usato automaticamente da Next come parte della cache key,
 * ogni utente ha la sua entry.
 *
 * Eventi che invalidano: enroll (confirmMfaSetup), disable, regenerate
 * recovery codes, admin reset. Quelle action chiamano
 * `revalidateTag(MFA_STATE_TAG)`. Login/verify NON invalidano (lasciamo
 * che lastUsedAt resti stale fino al refresh ciclico — è cosmetic).
 */
const fetchState = async (userId: string): Promise<MfaState> => {
  const [row] = await db
    .select({
      enabledAt: userMfaTotp.enabledAt,
      lastUsedAt: userMfaTotp.lastUsedAt,
    })
    .from(userMfaTotp)
    .where(eq(userMfaTotp.userId, userId))
    .limit(1);

  const enabled = row?.enabledAt != null;
  const pendingSetup = row != null && row.enabledAt == null;

  let remaining = 0;
  if (enabled) {
    const [c] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      );
    remaining = c?.total ?? 0;
  }

  return {
    enabled,
    pendingSetup,
    enabledAt: row?.enabledAt ?? null,
    lastUsedAt: row?.lastUsedAt ?? null,
    recoveryCodesRemaining: remaining,
  };
};

const fetchStateCached = unstable_cache(fetchState, ["mfa-state"], {
  revalidate: 60,
  tags: [MFA_STATE_TAG],
});

export async function getMfaState(userId: string): Promise<MfaState> {
  return fetchStateCached(userId);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Inizia il setup MFA: genera un secret nuovo, lo cifra e fa upsert in
 * `user_mfa_totp` con `enabled_at = NULL` (pending). Se esiste già una
 * row pending, viene sovrascritta. Se esiste una row enabled, throwa
 * (l'utente deve prima fare disable).
 *
 * Ritorna il secret in chiaro (base32) — il caller costruisce l'URL
 * `otpauth://` e il QR code, e mostra entrambi all'utente.
 */
export async function startMfaSetup(
  userId: string,
): Promise<{ secretBase32: string }> {
  const [existing] = await db
    .select({ enabledAt: userMfaTotp.enabledAt })
    .from(userMfaTotp)
    .where(eq(userMfaTotp.userId, userId))
    .limit(1);

  if (existing?.enabledAt != null) {
    throw new Error("[mfa] cannot start setup: MFA already enabled");
  }

  const secretBase32 = generateTotpSecretBase32();
  const encrypted = encryptSecret(secretBase32);

  if (existing) {
    await db
      .update(userMfaTotp)
      .set({
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        enabledAt: null,
        lastUsedAt: null,
        lastUsedCounter: null,
        updatedAt: new Date(),
      })
      .where(eq(userMfaTotp.userId, userId));
  } else {
    await db.insert(userMfaTotp).values({
      userId,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretTag: encrypted.tag,
    });
  }

  return { secretBase32 };
}

export type ConfirmMfaResult =
  | { ok: false; reason: "no_pending" | "invalid_token" }
  | { ok: true; recoveryCodes: string[] };

/**
 * Conferma il setup: verifica il primo codice TOTP, attiva MFA e
 * genera i 10 recovery codes. I codici plaintext vengono ritornati
 * UNA SOLA VOLTA — il caller li mostra all'utente.
 *
 * Atomico via transaction: o tutto (enable + 10 recovery rows) o niente.
 */
export async function confirmMfaSetup(
  userId: string,
  token: string,
): Promise<ConfirmMfaResult> {
  const [row] = await db
    .select({
      ciphertext: userMfaTotp.secretCiphertext,
      iv: userMfaTotp.secretIv,
      tag: userMfaTotp.secretTag,
      enabledAt: userMfaTotp.enabledAt,
    })
    .from(userMfaTotp)
    .where(eq(userMfaTotp.userId, userId))
    .limit(1);

  if (!row || row.enabledAt != null) {
    return { ok: false, reason: "no_pending" };
  }

  const secretBase32 = decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
  });

  const result = verifyTotpToken({ secretBase32, token });
  if (!result.valid) return { ok: false, reason: "invalid_token" };

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashed = await Promise.all(recoveryCodes.map(hashRecoveryCode));

  await db.transaction(async (tx) => {
    await tx
      .update(userMfaTotp)
      .set({
        enabledAt: new Date(),
        lastUsedAt: new Date(),
        lastUsedCounter: result.counter,
        updatedAt: new Date(),
      })
      .where(eq(userMfaTotp.userId, userId));

    await tx
      .delete(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, userId));

    await tx.insert(mfaRecoveryCodes).values(
      hashed.map((codeHash) => ({ userId, codeHash })),
    );
  });

  return { ok: true, recoveryCodes };
}

// ---------------------------------------------------------------------------
// Verify (login challenge)
// ---------------------------------------------------------------------------

/**
 * Carica il secret decifrato + l'ultimo step usato. Solo per MFA enabled.
 * Ritorna null se non c'è MFA attiva (il caller non dovrebbe chiamarla
 * in quel caso, ma è un safety net).
 */
async function loadEnabledSecret(userId: string): Promise<{
  secretBase32: string;
  lastUsedCounter: number | null;
} | null> {
  const [row] = await db
    .select({
      ciphertext: userMfaTotp.secretCiphertext,
      iv: userMfaTotp.secretIv,
      tag: userMfaTotp.secretTag,
      enabledAt: userMfaTotp.enabledAt,
      lastUsedCounter: userMfaTotp.lastUsedCounter,
    })
    .from(userMfaTotp)
    .where(eq(userMfaTotp.userId, userId))
    .limit(1);

  if (!row || row.enabledAt == null) return null;

  const secretBase32 = decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
  });
  return { secretBase32, lastUsedCounter: row.lastUsedCounter };
}

/**
 * Verifica un codice TOTP per il login. Aggiorna last_used_counter +
 * last_used_at solo in caso di successo.
 */
export async function verifyTotpForLogin(
  userId: string,
  token: string,
): Promise<VerifyTotpResult> {
  const data = await loadEnabledSecret(userId);
  if (!data) return { valid: false, reason: "invalid" };

  const result = verifyTotpToken({
    secretBase32: data.secretBase32,
    token,
    lastUsedCounter: data.lastUsedCounter,
  });

  if (result.valid) {
    await db
      .update(userMfaTotp)
      .set({
        lastUsedAt: new Date(),
        lastUsedCounter: result.counter,
        updatedAt: new Date(),
      })
      .where(eq(userMfaTotp.userId, userId));
  }

  return result;
}

/**
 * Consuma un recovery code. Cerca tra i codici non usati, fa bcrypt-compare
 * fino al match, marca `used_at`. Se nessun match, ritorna ok=false.
 */
export async function consumeRecoveryCode(
  userId: string,
  candidate: string,
): Promise<
  | { ok: true; remaining: number }
  | { ok: false }
> {
  const normalized = normalizeRecoveryCode(candidate);

  const rows = await db
    .select({
      id: mfaRecoveryCodes.id,
      codeHash: mfaRecoveryCodes.codeHash,
    })
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    );

  for (const row of rows) {
    if (await compareRecoveryCode(normalized, row.codeHash)) {
      await db
        .update(mfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(eq(mfaRecoveryCodes.id, row.id));
      return { ok: true, remaining: rows.length - 1 };
    }
  }

  return { ok: false };
}

// ---------------------------------------------------------------------------
// Recovery codes management
// ---------------------------------------------------------------------------

/**
 * Rigenera i 10 recovery codes (invalida i precedenti, ne crea 10 nuovi).
 * Ritorna i nuovi plaintext UNA SOLA VOLTA. Solo per utenti con MFA enabled.
 */
export async function regenerateRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashed = await Promise.all(codes.map(hashRecoveryCode));

  await db.transaction(async (tx) => {
    await tx
      .delete(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, userId));
    await tx
      .insert(mfaRecoveryCodes)
      .values(hashed.map((codeHash) => ({ userId, codeHash })));
  });

  return codes;
}

// ---------------------------------------------------------------------------
// Disable / reset
// ---------------------------------------------------------------------------

/**
 * Disabilita MFA: rimuove il secret e tutti i recovery code (anche quelli
 * già consumati — tabula rasa). Atomico via transaction.
 *
 * Lo step-up auth (password + TOTP corrente) è responsabilità del caller.
 */
export async function disableMfa(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userMfaTotp).where(eq(userMfaTotp.userId, userId));
    await tx
      .delete(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, userId));
  });
}

/** Alias semantico — usato da admin reset (PR 5). Audit log lato caller. */
export async function resetMfaForAdmin(userId: string): Promise<void> {
  return disableMfa(userId);
}

// ---------------------------------------------------------------------------
// Internal helpers (esposti per test)
// ---------------------------------------------------------------------------

export const __testing__ = {
  loadEnabledSecret,
  encryptForStorage(secretBase32: string): EncryptedPayload {
    return encryptSecret(secretBase32);
  },
};
