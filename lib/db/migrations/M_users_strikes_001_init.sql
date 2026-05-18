-- =============================================================================
-- Strikes & moderation enforcement — 001 init
-- =============================================================================
-- Sistema di strike YouTube-like cross-modulo. Una segnalazione accettata
-- da un moderatore può (opzionalmente) emettere uno strike all'autore
-- del contenuto. Al 3° strike attivo l'utente viene soft-bannato
-- (users.banned_at viene settato, il proxy/middleware blocca il login).
--
-- Counter denormalizzato `users.active_strikes_count` (0..3) aggiornato
-- via trigger DB → letture costanti su signin/auth path, niente
-- COUNT() su scale.
--
-- Strike sono PERMANENTI in V1 (no expiry). YouTube fa 90 giorni —
-- migrazione futura possibile aggiungendo expires_at + cron cleanup
-- che decrementa il counter e solleva eventuale ban se scende sotto 3.
--
-- Idempotente. Da incollare nel SQL Editor.
-- =============================================================================

-- ── 1) Tabella `users_strikes` (append-only history) ────────────────────────
CREATE TABLE IF NOT EXISTS "users_strikes" (
  "id"              uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"         uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issued_by"       uuid          NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  -- Discriminator del contenuto che ha originato lo strike
  "source_type"     varchar(16)   NOT NULL,
  -- soft FK: NON usiamo REFERENCES per non perdere lo strike se il
  -- contenuto viene hard-cancellato in futuro (history forensic).
  "source_id"       uuid          NOT NULL,
  -- Snapshot del body al momento dello strike (max 200 char). Utile
  -- per la timeline admin se il contenuto viene poi cancellato.
  "source_preview"  text,
  -- Reason key (riusa il catalog admin-editable di report-reasons)
  "reason"          varchar(40)   NOT NULL,
  -- Nota interna del moderatore (motivazione + audit trail)
  "note"            text,
  "issued_at"       timestamptz   NOT NULL DEFAULT NOW(),
  -- Revoca: settati insieme da revokeStrike admin action
  "revoked_at"      timestamptz,
  "revoked_by"      uuid          REFERENCES "users"("id") ON DELETE SET NULL,
  "revoke_note"     text,
  CONSTRAINT "users_strikes_source_type_chk"
    CHECK ("source_type" IN ('post', 'comment'))
);

-- ── 2) Indici ────────────────────────────────────────────────────────────────
-- Timeline per user (admin /access/users/[id]): DESC su issued_at
CREATE INDEX IF NOT EXISTS "idx_users_strikes_user_recent"
  ON "users_strikes" ("user_id", "issued_at" DESC);

-- Counter veloce attivi: parziale per `revoked_at IS NULL`
CREATE INDEX IF NOT EXISTS "idx_users_strikes_active"
  ON "users_strikes" ("user_id")
  WHERE "revoked_at" IS NULL;

-- ── 3) Counter denormalizzato su `users` ───────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "active_strikes_count" int NOT NULL DEFAULT 0;

-- Backfill: re-conta gli strike attivi (no-op su DB pulito perché la
-- tabella users_strikes è appena nata; safe per re-run).
UPDATE "users" u
SET "active_strikes_count" = COALESCE(s.cnt, 0)
FROM (
  SELECT user_id, COUNT(*)::int AS cnt
  FROM "users_strikes"
  WHERE revoked_at IS NULL
  GROUP BY user_id
) s
WHERE s.user_id = u.id;

-- ── 4) Trigger: sync del counter + auto-ban al 3° strike ───────────────────
CREATE OR REPLACE FUNCTION users_strikes_sync_count()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_count int;
BEGIN
  -- Determine quale user è cambiato (INSERT o UPDATE del revoked_at)
  IF TG_OP = 'INSERT' THEN
    v_user_id := NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  END IF;

  -- Re-conta gli strike attivi del user
  SELECT COUNT(*)::int INTO v_count
  FROM users_strikes
  WHERE user_id = v_user_id
    AND revoked_at IS NULL;

  -- Update counter + ban automatico al 3° strike (soft ban via banned_at).
  -- Se il count scende sotto 3 → solleva il ban automaticamente (revoke ha
  -- fatto scendere il counter, il moderatore aveva ritenuto sbagliato).
  UPDATE users
  SET
    active_strikes_count = v_count,
    banned_at = CASE
      WHEN v_count >= 3 AND banned_at IS NULL THEN NOW()
      WHEN v_count < 3 AND banned_at IS NOT NULL THEN NULL
      ELSE banned_at
    END,
    banned_reason = CASE
      WHEN v_count >= 3 AND banned_at IS NULL THEN '3-strike threshold'
      WHEN v_count < 3 THEN NULL
      ELSE banned_reason
    END,
    updated_at = NOW()
  WHERE id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_strikes_sync_count_trg ON users_strikes;
CREATE TRIGGER users_strikes_sync_count_trg
  AFTER INSERT OR UPDATE OF revoked_at OR DELETE
  ON users_strikes
  FOR EACH ROW EXECUTE FUNCTION users_strikes_sync_count();
