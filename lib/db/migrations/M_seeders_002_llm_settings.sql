-- =============================================================================
-- Module: Seeders — 002 LLM content generator settings
-- =============================================================================
--
-- Settings per il generatore di body via Claude. L'API key e' RIUSATA
-- da `modules.news.anthropic_api_key` (decisione 2026-05-26): un solo
-- billing account, una sola chiave da gestire.
--
-- Default:
--   - claude-haiku-4-5-20251001  → modello economico (~$0.30 / 100 post)
--   - temperature 0.9            → alto = varieta' (vs robotico)
--
-- Per qualita' massima (es. demo a investor): cambia llm_model a
-- 'claude-sonnet-4-6' dalla UI admin. Costo ~5x ma post piu' "umani".
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

INSERT INTO app_settings (key, value)
VALUES
  ('modules.seeders.llm_model',        'claude-haiku-4-5-20251001'),
  ('modules.seeders.llm_temperature',  '0.9')
ON CONFLICT (key) DO NOTHING;

COMMIT;
