-- =============================================================================
-- Module: Seeders — 003 profile fullname probability
-- =============================================================================
--
-- Probabilita' che un seed user abbia first_name/last_name compilato.
-- 40% di default: il 60% degli utenti finisce con first/last_name=null,
-- riflettendo che la maggior parte degli utenti reali non completa
-- queste due voci del profilo.
--
-- Range valido: 0..1 (la lettura applica clamp).
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

INSERT INTO app_settings (key, value)
VALUES ('modules.seeders.profile_fullname_probability', '0.4')
ON CONFLICT (key) DO NOTHING;

COMMIT;
