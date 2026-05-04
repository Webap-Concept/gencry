-- 0018_mfa_totp.sql
-- MFA TOTP (RFC 6238) come secondo fattore opzionale al login.
--
-- Due tabelle separate da `users`:
--  - user_mfa_totp: il secret TOTP (cifrato AES-256-GCM con MFA_ENCRYPTION_KEY),
--    1:1 con user. enabled_at NULL = setup iniziato ma non confermato (pending).
--    last_used_counter previene replay nello stesso step di 30s.
--  - mfa_recovery_codes: 10 codici monouso, hashati con bcrypt come le password.
--    used_at marca il consumo (one-shot). Indice partial sui codici non usati.
--
-- ON DELETE CASCADE per coprire account deletion (Art. 17 GDPR).
-- Esegui manualmente nel SQL Editor di Supabase.

CREATE TABLE IF NOT EXISTS "user_mfa_totp" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE
    REFERENCES "users"("id") ON DELETE CASCADE,
  -- Secret cifrato AES-256-GCM. ciphertext + iv + tag salvati in base64.
  "secret_ciphertext" text NOT NULL,
  "secret_iv" text NOT NULL,
  "secret_tag" text NOT NULL,
  "algorithm" varchar(16) NOT NULL DEFAULT 'SHA1',
  "digits" smallint NOT NULL DEFAULT 6,
  "period" smallint NOT NULL DEFAULT 30,
  -- NULL = pending (setup iniziato, non confermato). Valorizzato = MFA attivo.
  "enabled_at" timestamp,
  "last_used_at" timestamp,
  -- Replay-prevention: ultimo step TOTP consumato (counter = floor(unix/period)).
  "last_used_counter" bigint,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_mfa_totp_user_id"
  ON "user_mfa_totp"("user_id");

CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Partial index: la query "trova codici non ancora usati per questo user"
-- è quella calda durante il login. Senza WHERE used_at IS NULL l'indice
-- gonfia inutilmente con i codici già consumati.
CREATE INDEX IF NOT EXISTS "idx_mfa_recovery_codes_user_id_unused"
  ON "mfa_recovery_codes"("user_id") WHERE "used_at" IS NULL;
