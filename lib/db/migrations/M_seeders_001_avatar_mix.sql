-- =============================================================================
-- Module: Seeders — 001 avatar mix settings
-- =============================================================================
--
-- Settings tunable per il mix di strategie avatar dei seed users.
-- I 5 valori sono PESI (non-percentuali stretti): il pick weighted
-- random li somma e normalizza al volo, quindi `40/30/15/10/5` e
-- `8/6/3/2/1` producono la stessa distribuzione.
--
-- Default 40/30/15/10/5 = mix realistico per social crypto:
--   - 40% AI face   (foto realistica StyleGAN via TPDNE/Unsplash)
--   - 30% initials  (utente "non ha caricato la foto")
--   - 15% notionists (DiceBear illustrazione moderna)
--   - 10% lorelei   (DiceBear softer)
--   -  5% bottts    (DiceBear robot/anon)
--
-- Plus: chiave Unsplash API per fallback quando TPDNE rate-limita.
-- Lasciata vuota di default — il caller cade silenziosamente su
-- DiceBear se ne' TPDNE ne' Unsplash sono disponibili.
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

INSERT INTO app_settings (key, value)
VALUES
  ('modules.seeders.avatar_mix_ai_face',             '40'),
  ('modules.seeders.avatar_mix_initials',            '30'),
  ('modules.seeders.avatar_mix_dicebear_notionists', '15'),
  ('modules.seeders.avatar_mix_dicebear_lorelei',    '10'),
  ('modules.seeders.avatar_mix_dicebear_bottts',     '5'),
  ('storage.unsplash.access_key',                    '')
ON CONFLICT (key) DO NOTHING;

COMMIT;
