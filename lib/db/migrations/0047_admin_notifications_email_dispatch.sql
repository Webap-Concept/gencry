-- =============================================================================
-- 0047 — admin_notifications: email dispatch tracking
-- =============================================================================
-- Aggiunge 3 colonne ad admin_notifications per supportare il dispatcher
-- email generico (vedi lib/notifications/email-channel/).
--
-- Decisione architetturale 2026-05-14: il dispatcher email è UNICO per
-- tutte le notification types (cron failures, sessions suspicious,
-- future: security, payments, ...). Lo state "email inviata" vive
-- direttamente sulla row di admin_notifications così non servono
-- tabelle parallele di outbox.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

ALTER TABLE "admin_notifications"
  ADD COLUMN IF NOT EXISTS "email_sent_at"        timestamptz,
  ADD COLUMN IF NOT EXISTS "email_send_attempts"  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_email_error"     text;

-- Index per la query "candidati da emailare": notifiche non ancora
-- inviate, non resolved, non dismissed, ordinate per priorità (createdAt).
-- Partial index = compatto, solo righe rilevanti.
CREATE INDEX IF NOT EXISTS "idx_admin_notifications_email_pending"
  ON "admin_notifications" ("type", "severity", "created_at")
  WHERE "email_sent_at" IS NULL
    AND "resolved_at" IS NULL
    AND "dismissed_at" IS NULL;
