-- Migration 0028: policy_change_notifications (job table for re-consent flow)
--
-- Tabella di lavoro per il cron `policy-change-notifications`. Quando una
-- pagina di sistema (terms / privacy / marketing) viene aggiornata via
-- upsertPage e `gdpr.policy.force_reconsent_on_change` = 'true', viene
-- enqueata una riga `pending` per ogni utente con versione obsoleta.
--
-- Il cron worker:
--   1. SELECT pending raggruppando per user_id (max N utenti per run)
--   2. Per ogni utente, una sola mail con tutte le policy aggiornate
--   3. Marca le righe `sent` (o `failed` con retry fino a max attempts)
--
-- La frontend (banner di re-consent in /(protected)/layout.tsx) controlla:
--   - se per (user, policy_key, currentVersion) esiste una riga di QUALSIASI
--     stato → mostra banner / modale
--   - usa la più vecchia `created_at` per decidere banner gentile vs modale
--     bloccante (oltre `gdpr.policy.reconsent_grace_days`)
--
-- UNIQUE(user_id, policy_key, policy_version): dedup automatico.
-- ON DELETE CASCADE su user_id: il purge utente porta via anche queste righe
-- (uniformemente con consent_records, niente residui orfani).

CREATE TABLE IF NOT EXISTS "policy_change_notifications" (
  "id"             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        uuid         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "policy_key"     varchar(20)  NOT NULL,
  "policy_version" varchar(20)  NOT NULL,
  "status"         varchar(20)  NOT NULL DEFAULT 'pending',
  "attempt_count"  integer      NOT NULL DEFAULT 0,
  "created_at"     timestamp    NOT NULL DEFAULT NOW(),
  "sent_at"        timestamp,
  "error"          text,
  CONSTRAINT "policy_change_notifications_policy_key_chk"
    CHECK ("policy_key" IN ('terms', 'privacy', 'marketing')),
  CONSTRAINT "policy_change_notifications_status_chk"
    CHECK ("status" IN ('pending', 'sent', 'failed', 'skipped'))
);

-- Dedup: stesso utente + policy + versione → una sola riga.
CREATE UNIQUE INDEX IF NOT EXISTS "policy_change_notifications_uq"
  ON "policy_change_notifications" ("user_id", "policy_key", "policy_version");

-- Cron worker query path: filtra per status, ordinato per anzianità.
CREATE INDEX IF NOT EXISTS "idx_policy_change_notifications_status"
  ON "policy_change_notifications" ("status", "created_at");

-- Banner UI query path: dato un user, prendi le sue righe.
CREATE INDEX IF NOT EXISTS "idx_policy_change_notifications_user"
  ON "policy_change_notifications" ("user_id");
