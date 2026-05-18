-- =============================================================================
-- Module: Posts (social feed) — 009 user preferences (sticky composer defaults)
-- =============================================================================
-- Sidecar 1:1 con users per memorizzare preferenze del modulo Posts.
--
-- Prima preferenza: `default_visibility` — l'ultima visibility scelta dall'utente
-- nel Composer diventa il default per i post successivi (UX LinkedIn/Twitter,
-- cross-device). Row creata lazy on first set; assenza row = default app "public".
--
-- Pattern mutuato da `admin_user_preferences`: tabella separata per evitare
-- di gonfiare `users` (la maggior parte degli utenti non avrà mai una riga
-- finché non cambia esplicitamente una preferenza).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "posts_user_preferences" (
  "user_id"            uuid          PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "default_visibility" varchar(16)   NOT NULL DEFAULT 'public',
  "created_at"         timestamptz   NOT NULL DEFAULT NOW(),
  "updated_at"         timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "posts_user_preferences_visibility_chk"
    CHECK ("default_visibility" IN ('public','members','followers','private'))
);
