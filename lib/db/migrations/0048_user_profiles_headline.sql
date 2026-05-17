-- 0048_user_profiles_headline.sql
--
-- Aggiunge la colonna `headline` a `user_profiles` per la "frase breve"
-- visibile sotto lo username (pattern LinkedIn: visibile in liste compatte
-- + avatar preview). La `bio` esistente resta come testo esteso visibile
-- nella pagina profilo. Niente backfill: gli utenti possono compilare
-- il nuovo campo dalle settings.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.

BEGIN;

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "headline" varchar(160);

COMMIT;
