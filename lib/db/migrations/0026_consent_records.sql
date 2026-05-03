-- Migration 0026: consent_records (append-only consent ledger)
--
-- Tabella append-only che registra OGNI evento di consenso (granted/revoked)
-- per ogni utente, con metadata di dimostrabilità (IP, user-agent, hash del
-- testo policy mostrato). È la base per la conformità a GDPR Art. 7(1):
-- "il titolare deve essere in grado di dimostrare che l'interessato ha
-- prestato il proprio consenso".
--
-- Pattern di scrittura: SEMPRE attraverso lib/account/consent-ledger.ts
-- (recordConsent), MAI INSERT diretti dalla UI. L'helper applica le
-- settings (gdpr.consent_log.*) per:
--   - skippare se gdpr.consent_log.enabled = 'false' (modalità legacy)
--   - non salvare IP se capture_ip = 'false'
--   - mascherare/hashare IP secondo ip_strategy
--   - hashare il testo policy secondo hash_policy_text
--
-- Immutabilità: due trigger BEFORE UPDATE/DELETE rifiutano qualsiasi modifica
-- successiva all'INSERT, anche da super-admin Supabase. L'unica deroga è il
-- cron retention (purge oltre gdpr.consent_log.retention_after_deletion_days)
-- che aggira i trigger via `SET LOCAL session_replication_role = replica;`.
--
-- user_id ON DELETE SET NULL: il purge fisico utente cancella la riga `users`
-- via cascade, ma la consent_records resta — come activity_logs — preservando
-- l'audit trail (la chiave estera diventa NULL, niente cascade DELETE).

CREATE TABLE IF NOT EXISTS "consent_records" (
  "id"               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          uuid         REFERENCES "users"("id") ON DELETE SET NULL,
  "consent_type"     varchar(50)  NOT NULL,
  "action"           varchar(20)  NOT NULL,
  "policy_version"   varchar(20),
  "policy_text_hash" varchar(64),
  "ip"               varchar(64),
  "ip_strategy"      varchar(20)  NOT NULL DEFAULT 'full',
  "user_agent"       varchar(512),
  "locale"           varchar(10),
  "metadata"         jsonb        NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp    NOT NULL DEFAULT NOW(),
  CONSTRAINT "consent_records_consent_type_chk"
    CHECK ("consent_type" IN (
      'terms', 'privacy', 'marketing',
      'cookie_necessary', 'cookie_preferences',
      'cookie_analytics', 'cookie_marketing'
    )),
  CONSTRAINT "consent_records_action_chk"
    CHECK ("action" IN ('granted', 'revoked')),
  CONSTRAINT "consent_records_ip_strategy_chk"
    CHECK ("ip_strategy" IN ('full', 'mask_last_octet', 'hash_only'))
);

-- Indici di lookup
--   1) per utente + tipo (vista "i miei consensi" / settings privacy)
--   2) per tipo + tempo (audit globale, dashboard admin)
--   3) per tempo (retention cron sweep)
CREATE INDEX IF NOT EXISTS "idx_consent_records_user_type_time"
  ON "consent_records" ("user_id", "consent_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_consent_records_type_time"
  ON "consent_records" ("consent_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_consent_records_created_at"
  ON "consent_records" ("created_at");

-- Funzione + trigger di immutabilità.
-- Il nome "consent_records_immutable_*" è atteso da lib/account/gdpr-stats.ts
-- (`tgname LIKE '%immutable%'`) per il check di "Immutability trigger active"
-- nella dashboard /admin/compliance/gdpr.
CREATE OR REPLACE FUNCTION "consent_records_deny_modify"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent_records is append-only: % not allowed', TG_OP
    USING ERRCODE = '23001'; -- restrict_violation
END;
$$;

DROP TRIGGER IF EXISTS "consent_records_immutable_update" ON "consent_records";
CREATE TRIGGER "consent_records_immutable_update"
  BEFORE UPDATE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION "consent_records_deny_modify"();

DROP TRIGGER IF EXISTS "consent_records_immutable_delete" ON "consent_records";
CREATE TRIGGER "consent_records_immutable_delete"
  BEFORE DELETE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION "consent_records_deny_modify"();

-- ---------------------------------------------------------------------------
-- Backfill dei consensi correnti
--
-- Crea una riga "granted" per ogni utente con un consenso ATTIVO al momento
-- della migration. Non possiamo recuperare IP/user-agent/hash testo perché
-- non li avevamo registrati, quindi quei campi restano NULL e il record
-- ha metadata.source = 'backfill' per distinguere dai consensi raccolti
-- nativamente dopo la migration.
--
-- Logica: consenso = granted se "accepted_*_at" IS NOT NULL al momento del
-- backfill. Le revoche pregresse sono perse (il vecchio toggle marketing
-- azzera i campi senza loggare nulla) — accettiamo questa limitazione, da
-- qui in poi tutto sarà tracciato.

INSERT INTO "consent_records"
  ("user_id", "consent_type", "action", "policy_version", "metadata", "created_at")
SELECT
  "id",
  'terms',
  'granted',
  "accepted_terms_version",
  '{"source":"backfill"}'::jsonb,
  "accepted_terms_at"
FROM "users"
WHERE "accepted_terms_at" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "consent_records"
  ("user_id", "consent_type", "action", "policy_version", "metadata", "created_at")
SELECT
  "id",
  'privacy',
  'granted',
  "accepted_privacy_version",
  '{"source":"backfill"}'::jsonb,
  "accepted_privacy_at"
FROM "users"
WHERE "accepted_privacy_at" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "consent_records"
  ("user_id", "consent_type", "action", "policy_version", "metadata", "created_at")
SELECT
  "id",
  'marketing',
  'granted',
  "accepted_marketing_version",
  '{"source":"backfill"}'::jsonb,
  "accepted_marketing_at"
FROM "users"
WHERE "accepted_marketing_at" IS NOT NULL
ON CONFLICT DO NOTHING;
