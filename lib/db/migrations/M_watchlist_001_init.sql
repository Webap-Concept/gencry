-- M_watchlist_001_init.sql
--
-- Modulo watchlist (PR1): fondazione.
--
-- Tabelle:
--   - watchlists           — la watchlist owned dall'utente
--   - watchlist_coins      — coin contenute (PK composta watchlist+symbol)
--   - watchlist_followers  — V1 vuota; schema gia' pronto per V2 social
--
-- Limite per-utente:
--   - function `get_user_watchlist_cap(uid)` PL/pgSQL — single source of
--     truth. Oggi ritorna sempre il setting `max_per_user_free` (5).
--     Quando arrivera' il modulo subscriptions premium reale, basta
--     aggiornare il body della function (lookup su user_subscriptions)
--     senza migration.
--   - trigger BEFORE INSERT su watchlists che RAISE 'watchlist_cap_reached'
--     se il count active (archived_at IS NULL) supera il cap.
--
-- Counter denormalizzati:
--   - watchlists.coins_count — sync via trigger AFTER INSERT/DELETE su
--     watchlist_coins.
--   - watchlists.followers_count — V2, oggi sempre 0.
--
-- Visibility:
--   - watchlists.visibility 'private' | 'public'. Public esposta via
--     /w/<username>/<slug> SEO. Slug autogenerato app-side ma vincolo
--     UNIQUE(user_id, slug) qui per safety.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- Tabella watchlists
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "watchlists" (
  "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"          uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"             varchar(64) NOT NULL,
  "slug"             varchar(64) NOT NULL,
  "description"      text,
  "visibility"       varchar(16) NOT NULL DEFAULT 'private',
  "position"         integer NOT NULL DEFAULT 0,
  "coins_count"      integer NOT NULL DEFAULT 0,
  "followers_count"  integer NOT NULL DEFAULT 0,
  "archived_at"      timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "watchlists_visibility_chk"
    CHECK ("visibility" IN ('private', 'public')),
  CONSTRAINT "watchlists_name_not_empty_chk"
    CHECK (length(trim("name")) > 0),
  CONSTRAINT "watchlists_slug_format_chk"
    CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$' OR length("slug") = 1)
);

-- Slug deve essere unico per utente (URL /w/<username>/<slug>).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_watchlists_user_slug"
  ON "watchlists" ("user_id", "slug")
  WHERE "archived_at" IS NULL;

-- Lookup "le mie watchlist", ordered by position then created_at.
CREATE INDEX IF NOT EXISTS "idx_watchlists_user_active"
  ON "watchlists" ("user_id", "position", "created_at")
  WHERE "archived_at" IS NULL;

-- Lookup pubblica "trova la watchlist di @user con slug X" — la usa
-- /w/<username>/<slug>: prima JOIN su user_profiles, poi filter su slug
-- + visibility public.
CREATE INDEX IF NOT EXISTS "idx_watchlists_public_slug"
  ON "watchlists" ("user_id", "slug")
  WHERE "visibility" = 'public' AND "archived_at" IS NULL;

-- ───────────────────────────────────────────────────────────────────────
-- Tabella watchlist_coins
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "watchlist_coins" (
  "watchlist_id"  uuid NOT NULL REFERENCES "watchlists"("id") ON DELETE CASCADE,
  "symbol"        varchar(20) NOT NULL,
  "position"      integer NOT NULL DEFAULT 0,
  "added_at"      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("watchlist_id", "symbol")
);

-- Lookup "tutte le coin di queste watchlists" (batch JOIN nella lista).
CREATE INDEX IF NOT EXISTS "idx_watchlist_coins_wl_position"
  ON "watchlist_coins" ("watchlist_id", "position", "added_at");

-- Reverse lookup "in quante watchlist e' contenuta questa coin?" —
-- per il counter futuro su /coins/<symbol> ("in N watchlists").
CREATE INDEX IF NOT EXISTS "idx_watchlist_coins_symbol"
  ON "watchlist_coins" ("symbol");

-- ───────────────────────────────────────────────────────────────────────
-- Tabella watchlist_followers (V2 placeholder — vuota in V1)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "watchlist_followers" (
  "watcher_user_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "watchlist_id"     uuid NOT NULL REFERENCES "watchlists"("id") ON DELETE CASCADE,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("watcher_user_id", "watchlist_id")
);

CREATE INDEX IF NOT EXISTS "idx_watchlist_followers_wl"
  ON "watchlist_followers" ("watchlist_id", "created_at");

-- ───────────────────────────────────────────────────────────────────────
-- Function: cap per-user (single source of truth)
-- ───────────────────────────────────────────────────────────────────────
-- Oggi ritorna sempre il free cap. Quando arrivera' il modulo
-- subscriptions, aggiornare il body per leggere il tier dell'utente:
--
--   IF EXISTS (SELECT 1 FROM user_subscriptions
--              WHERE user_id = uid AND tier = 'premium'
--                AND active = true) THEN
--     RETURN COALESCE(NULLIF(...max_per_user_premium...,'')::int, 20);
--   END IF;
CREATE OR REPLACE FUNCTION get_user_watchlist_cap(uid uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_free_cap int;
BEGIN
  SELECT NULLIF(value, '')::int INTO v_free_cap
  FROM app_settings
  WHERE key = 'modules.watchlist.max_per_user_free';
  RETURN COALESCE(v_free_cap, 5);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: cap enforcement
-- ───────────────────────────────────────────────────────────────────────
-- Conta solo le watchlist ATTIVE (archived_at IS NULL). RAISE
-- 'watchlist_cap_reached' che la server action traduce in un error
-- code i18n-friendly per la UI.
CREATE OR REPLACE FUNCTION watchlists_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_cap   int;
BEGIN
  -- Se l'INSERT crea una watchlist gia' archived, non conta verso il cap.
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_count FROM watchlists
  WHERE user_id = NEW.user_id AND archived_at IS NULL;
  v_cap := get_user_watchlist_cap(NEW.user_id);
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'watchlist_cap_reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlists_enforce_cap_trg ON watchlists;
CREATE TRIGGER watchlists_enforce_cap_trg
BEFORE INSERT ON watchlists
FOR EACH ROW EXECUTE FUNCTION watchlists_enforce_cap();

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: max coins per watchlist
-- ───────────────────────────────────────────────────────────────────────
-- Setting `modules.watchlist.max_coins_per_watchlist` (default 50).
-- Stesso pattern del cap watchlist: hard-stop a DB level.
CREATE OR REPLACE FUNCTION watchlist_coins_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_cap   int;
BEGIN
  SELECT count(*) INTO v_count FROM watchlist_coins
  WHERE watchlist_id = NEW.watchlist_id;
  SELECT NULLIF(value, '')::int INTO v_cap
  FROM app_settings
  WHERE key = 'modules.watchlist.max_coins_per_watchlist';
  v_cap := COALESCE(v_cap, 50);
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'watchlist_coins_cap_reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_coins_enforce_cap_trg ON watchlist_coins;
CREATE TRIGGER watchlist_coins_enforce_cap_trg
BEFORE INSERT ON watchlist_coins
FOR EACH ROW EXECUTE FUNCTION watchlist_coins_enforce_cap();

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: sync coins_count
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION watchlist_coins_sync_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE watchlists
      SET coins_count = coins_count + 1, updated_at = now()
      WHERE id = NEW.watchlist_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE watchlists
      SET coins_count = GREATEST(coins_count - 1, 0), updated_at = now()
      WHERE id = OLD.watchlist_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_coins_sync_count_trg ON watchlist_coins;
CREATE TRIGGER watchlist_coins_sync_count_trg
AFTER INSERT OR DELETE ON watchlist_coins
FOR EACH ROW EXECUTE FUNCTION watchlist_coins_sync_count();

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: sync followers_count (V2 — placeholder ready)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION watchlist_followers_sync_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE watchlists
      SET followers_count = followers_count + 1, updated_at = now()
      WHERE id = NEW.watchlist_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE watchlists
      SET followers_count = GREATEST(followers_count - 1, 0), updated_at = now()
      WHERE id = OLD.watchlist_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_followers_sync_count_trg ON watchlist_followers;
CREATE TRIGGER watchlist_followers_sync_count_trg
AFTER INSERT OR DELETE ON watchlist_followers
FOR EACH ROW EXECUTE FUNCTION watchlist_followers_sync_count();

-- ───────────────────────────────────────────────────────────────────────
-- Settings seed
-- ───────────────────────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, updated_at) VALUES
  ('modules.watchlist.max_per_user_free',     '5',   now()),
  ('modules.watchlist.max_per_user_premium',  '20',  now()),
  ('modules.watchlist.max_coins_per_watchlist', '50', now()),
  ('modules.watchlist.perf_cache_ttl_seconds', '300', now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
