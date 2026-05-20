-- =============================================================================
-- Module: Posts — 012 comments_disabled flag
-- =============================================================================
-- Aggiunge la colonna `comments_disabled BOOLEAN NOT NULL DEFAULT FALSE` a
-- `posts`. Quando TRUE, il modulo blocca l'aggiunta di commenti (anche al
-- proprietario) e l'UI sostituisce la sezione commenti con un banner.
--
-- Default FALSE → backward-compat zero-touch: tutti i post esistenti
-- mantengono commenti abilitati come prima del refactor. Future iteration:
-- consentire toggle post-publish via menu post (oggi solo create-time
-- dal composer).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "comments_disabled" BOOLEAN NOT NULL DEFAULT FALSE;
