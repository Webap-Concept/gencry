-- =============================================================================
-- Module: Posts (social feed) — 999 uninstall
-- =============================================================================
-- Disinstalla completamente il modulo Posts (feed sociale).
-- Eseguire SOLO se si vuole rimuovere il modulo dall'app.
--
-- DOPO l'esecuzione SQL: rimuovere POSTS_MODULE da `lib/modules/registry.ts` e
-- cancellare:
--   - lib/modules/posts/
--   - app/(admin)/admin/modules/posts/
--   - app/api/cron/modules/posts/
--   - components/modules/posts/ (se presente)
--   - le rispettive entries in vercel.json
--
-- NB: i media già caricati su R2 NON vengono cancellati da questa migration.
-- Per cleanup R2: prima dell'uninstall, eseguire il cron orphan-cleanup con
-- una soglia retro (0 ore) per drenare tutto, oppure cancellare manualmente
-- il bucket `social-media` (vedi modules.posts.r2.bucket).
--
-- Idempotente.
-- =============================================================================

-- ── 1) Rimuovi i grant role→permission ────────────────────────────────────
DELETE FROM "role_permissions"
  WHERE permission_id IN (
    SELECT id FROM "permissions" WHERE key IN ('modules:posts', 'modules:posts.moderate')
  );

-- ── 2) Rimuovi i grant utente diretti ─────────────────────────────────────
DELETE FROM "user_permissions"
  WHERE permission_id IN (
    SELECT id FROM "permissions" WHERE key IN ('modules:posts', 'modules:posts.moderate')
  );

-- ── 3) Rimuovi le permission ──────────────────────────────────────────────
DELETE FROM "permissions" WHERE key IN ('modules:posts', 'modules:posts.moderate');

-- ── 4) Rimuovi le settings keys ───────────────────────────────────────────
DELETE FROM "app_settings" WHERE key LIKE 'modules.posts.%';

-- ── 5) Droppa le tabelle (in ordine inverso ai FK) ────────────────────────
DROP TABLE IF EXISTS "posts_outbox"          CASCADE;
DROP TABLE IF EXISTS "posts_link_previews"   CASCADE;
DROP TABLE IF EXISTS "posts_mentions"        CASCADE;
DROP TABLE IF EXISTS "posts_tickers"         CASCADE;
DROP TABLE IF EXISTS "posts_reports"         CASCADE;
DROP TABLE IF EXISTS "posts_bookmarks"       CASCADE;
DROP TABLE IF EXISTS "posts_comments"        CASCADE;
DROP TABLE IF EXISTS "posts_reactions"       CASCADE;
DROP TABLE IF EXISTS "posts_media"           CASCADE;
DROP TABLE IF EXISTS "posts"                 CASCADE;

-- ── 6) Droppa le trigger function del modulo ──────────────────────────────
-- I trigger sono già stati droppati implicitamente dal DROP TABLE CASCADE
-- sopra (i trigger sono attaccati alle tabelle). Le function PL/pgSQL
-- restano orfane: le rimuoviamo qui.
DROP FUNCTION IF EXISTS posts_reactions_counter_trg();
DROP FUNCTION IF EXISTS posts_reactions_outbox_trg();
DROP FUNCTION IF EXISTS posts_comments_counter_trg();
DROP FUNCTION IF EXISTS posts_comments_outbox_trg();
DROP FUNCTION IF EXISTS posts_bookmarks_counter_trg();
DROP FUNCTION IF EXISTS posts_repost_counter_trg();
DROP FUNCTION IF EXISTS posts_repost_outbox_trg();
DROP FUNCTION IF EXISTS posts_mentions_outbox_trg();

-- ── 7) Droppa la funzione uuid_generate_v7 ────────────────────────────────
-- NB: la funzione potrebbe essere usata da altri moduli futuri. Non droppare
-- automaticamente. Decommentare manualmente se SICURI che non è più usata.
-- DROP FUNCTION IF EXISTS uuid_generate_v7();
