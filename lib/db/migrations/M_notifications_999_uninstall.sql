-- =============================================================================
-- Module: Notifications — 999 uninstall
-- =============================================================================
-- Rimuove tutto ciò che M_notifications_001_init.sql ha creato.
-- Idempotente. Per il principio di module isolation, NON tocca nulla del
-- core o di altri moduli (posts_outbox resta, solo il trigger di fanout
-- viene rimosso).
-- =============================================================================

-- Trigger + function di fanout (rimosse PRIMA della tabella per non
-- lasciare riferimenti orfani).
DROP TRIGGER IF EXISTS posts_outbox_to_notifications_trg ON posts_outbox;
DROP FUNCTION IF EXISTS notifications_fanout_from_outbox();

-- Realtime publication: rimuovi la tabella dalla publication prima del DROP
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
    EXCEPTION WHEN undefined_object OR undefined_table THEN
      NULL;
    END;
  END IF;
END$$;

DROP TABLE IF EXISTS "notifications" CASCADE;

DELETE FROM "app_settings" WHERE key LIKE 'modules.notifications.%';

DELETE FROM "role_permissions"
WHERE permission_id IN (
  SELECT id FROM "permissions" WHERE key = 'modules:notifications'
);
DELETE FROM "permissions" WHERE key = 'modules:notifications';
