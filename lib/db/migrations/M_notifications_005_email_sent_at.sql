-- =============================================================================
-- Module: Notifications — 005 email_sent_at tracking
-- =============================================================================
--
-- Aggiunge la colonna per tracciare quando una notification è stata
-- spedita via email dal dispatcher cron del modulo. NULL = pending /
-- da inviare. Set a NOW() dopo successful send.
--
-- Index parziale per il cron scan: WHERE email_sent_at IS NULL AND
-- type LIKE 'achievement.%' (V1 invia email solo per achievements).
-- L'index è leggero: si popola solo coi pending — query scan O(log N)
-- sul backlog, NON sull'intera tabella notifications.
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "email_sent_at" timestamptz;

-- Partial index: rapido scan del backlog email pending (cron ogni 20min).
CREATE INDEX IF NOT EXISTS "idx_notifications_email_pending"
  ON "notifications" ("created_at" ASC)
  WHERE "email_sent_at" IS NULL
    AND "type" LIKE 'achievement.%';

COMMIT;
