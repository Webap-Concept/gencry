-- M_users_profile_001_visibility.sql
--
-- Aggiunge `users.profile_visibility` per supportare il toggle
-- "profilo pubblico / protetto" (pattern Twitter/Instagram).
--
-- Stato 2026-05-21:
--   - Tutti gli account esistenti → default 'public' (back-compat).
--   - La colonna esiste già nello schema ma la UI per cambiarla NON è
--     ancora disponibile (arriva con livello B, vedi
--     project_profile_page_plan).
--   - Il filtro "protected → solo follower" è no-op finché non c'è il
--     modulo follows: serviva solo per evitare una seconda migration
--     quando il toggle arriverà.
--
-- Constraint CHECK: solo i due valori accettati. Aggiungere 'unlisted'
-- (visibile via link diretto ma non in /explore) come terza opzione se
-- in futuro l'admin ne ha bisogno.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_visibility varchar(20) NOT NULL DEFAULT 'public'
  CHECK (profile_visibility IN ('public', 'protected'));

COMMENT ON COLUMN users.profile_visibility IS
  'public = chiunque (anche anon) vede header + feed; protected = solo follower vedono feed (modulo follows non ancora attivo, no-op v1).';
