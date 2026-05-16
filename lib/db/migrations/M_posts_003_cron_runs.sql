-- =============================================================================
-- Module: Posts (social feed) — 003 cron runs (observability)
-- =============================================================================
-- Tabella di log per i cron job del modulo posts. Stesso pattern di
-- `prices_sync_runs`: ogni esecuzione (manual o automatica da pg_cron)
-- ne lascia traccia per debug + UI admin "View recent runs".
--
-- Cron job che la popolano (in PR-7):
--   - posts-orphan-media-cleanup  → daily 03:00 UTC
--   - posts-outbox-cleanup        → daily 04:00 UTC
--
-- Niente FK su nessuna tabella: la log row sopravvive anche se i record
-- target sono stati cancellati (caso normale per cleanup job).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "posts_cron_runs" (
  "id"               bigserial    PRIMARY KEY,
  -- 'orphan_media_cleanup' | 'outbox_cleanup' | (futuri: 'link_previews_refresh', ...)
  "kind"             varchar(40)  NOT NULL,
  "started_at"       timestamptz  NOT NULL DEFAULT NOW(),
  "finished_at"      timestamptz,
  "duration_ms"      integer,
  -- Quanti record/oggetti il job ha processato (rows DB cancellate,
  -- file R2 eliminati, ecc.). Per gli observability dashboard.
  "items_processed"  integer      NOT NULL DEFAULT 0,
  "ok"               boolean      NOT NULL DEFAULT false,
  "error"            text
);

CREATE INDEX IF NOT EXISTS "idx_posts_cron_runs_kind_started"
  ON "posts_cron_runs" ("kind", "started_at" DESC);
