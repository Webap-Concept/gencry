-- M_posts_006_deleted_by.sql
--
-- Aggiunge la colonna `posts.deleted_by` per distinguere chi ha
-- soft-deletato il post:
--   - 'author'                     → l'utente stesso (delete da UI)
--   - <uuid del moderatore>        → admin con `modules:posts.moderate`
--                                    (review report → actioned)
--   - NULL                         → post non cancellato (deleted_at IS NULL)
--
-- Why varchar(40) e non FK uuid: serve ospitare sia il literal 'author'
-- sia un uuid (36 char). La risoluzione uuid → user via JOIN cast text
-- nelle query lato admin (LEFT JOIN user_profiles ON
-- user_profiles.user_id::text = posts.deleted_by) — niente referential
-- integrity, accettabile per audit trail. Se in futuro vorrai full FK,
-- splitta in deleted_by_kind + deleted_by_user_id.
--
-- Le righe pre-esistenti (post già soft-deleted prima di questa
-- migration) restano NULL: la UI le mostra come "Sconosciuto".
-- Backfill non possibile (info non recuperabile in modo affidabile).

BEGIN;

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(40);

COMMIT;
