-- =============================================================================
-- Module: Notifications — 007 retention cleanup
-- =============================================================================
--
-- Aggiunge l'indice di supporto al cron giornaliero che cancella le
-- notifiche più vecchie di `modules.notifications.retention_days`
-- (default 180gg, già seedato in M_001).
--
-- Indice `idx_notifications_created_at_asc`: usato dalla subquery
--   SELECT ctid FROM notifications WHERE created_at < $cutoff
--   ORDER BY created_at LIMIT 5000
-- senza questo, il DELETE in batch farebbe seq scan sull'intera tabella
-- ad ogni run quando l'arretrato è grande.
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS "idx_notifications_created_at_asc"
  ON "notifications" ("created_at" ASC);

COMMIT;

-- ── pg_cron schedule (da incollare a parte, dopo deploy del route) ────────
-- Lo schedule pg_cron non sta in transaction (richiede credenziali Supabase),
-- ma viene mostrato nella UI admin /admin/modules/notifications/cron come
-- "missing job" con bottone Copy-SQL. Comando di riferimento:
--
--   SELECT cron.schedule(
--     'modules-notifications-retention-cleanup',
--     '30 4 * * *',
--     $$ SELECT net.http_get(
--          url := '<APP_URL>/api/cron/modules/notifications/retention-cleanup',
--          headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--        ); $$
--   );
