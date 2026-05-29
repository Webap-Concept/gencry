-- M_social_graph_001_init.sql
--
-- Modulo social-graph (PR1): fondazione following + counter denormalizzati.
--
-- Tabelle:
--   - user_follows           — relazione directed (follower → followed)
--   - user_social_counters   — counter denorm (followers_count, following_count)
--
-- Triggers:
--   - user_follows_block_guard_trg (BEFORE INSERT):
--       rifiuta il follow se esiste un blocco mutuale tra i due utenti
--       (verso posts_user_blocks). Mantiene la semantica "block = muro
--       totale" del modulo Posts.
--   - user_follows_sync_counters_trg (AFTER INSERT/DELETE):
--       UPSERT atomico su user_social_counters; +/-1 sui due utenti
--       coinvolti. Idempotente al delete (clamp >= 0 per sicurezza).
--
-- Index strategy:
--   - PK (follower_id, followed_id) → lookup "chi seguo io"
--   - idx_user_follows_follower_created (follower_id, created_at) →
--       lista "following ordered by date" per pagina /u/[u]/following
--   - idx_user_follows_followed (followed_id, created_at) →
--       lista "followers ordered by date" per pagina /u/[u]/followers
--
-- Cleanup: CASCADE su users → cancellazione account rimuove tutto.

BEGIN;

CREATE TABLE IF NOT EXISTS "user_follows" (
  "follower_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "followed_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("follower_id", "followed_id"),
  CONSTRAINT "user_follows_no_self_chk"
    CHECK ("follower_id" <> "followed_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_follows_follower_created"
  ON "user_follows" ("follower_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_user_follows_followed"
  ON "user_follows" ("followed_id", "created_at");

CREATE TABLE IF NOT EXISTS "user_social_counters" (
  "user_id"          uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "followers_count"  integer NOT NULL DEFAULT 0,
  "following_count"  integer NOT NULL DEFAULT 0,
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: block guard
-- ───────────────────────────────────────────────────────────────────────
-- Rifiuta il follow se esiste una riga in posts_user_blocks in qualsiasi
-- direzione tra i due utenti. È un duplicato del check JS-side nelle
-- server actions, ma serve come gate finale per chiunque bypassi il
-- layer applicativo (script admin, SQL diretto, future API esterne).
CREATE OR REPLACE FUNCTION user_follows_block_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM posts_user_blocks
    WHERE (blocker_id = NEW.follower_id AND blocked_id = NEW.followed_id)
       OR (blocker_id = NEW.followed_id AND blocked_id = NEW.follower_id)
  ) THEN
    RAISE EXCEPTION 'follow_blocked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_follows_block_guard_trg ON user_follows;
CREATE TRIGGER user_follows_block_guard_trg
BEFORE INSERT ON user_follows
FOR EACH ROW EXECUTE FUNCTION user_follows_block_guard();

-- ───────────────────────────────────────────────────────────────────────
-- Trigger: sync counters
-- ───────────────────────────────────────────────────────────────────────
-- INSERT  → following_count++ (follower), followers_count++ (followed)
-- DELETE  → following_count-- (follower), followers_count-- (followed)
--
-- UPSERT con ON CONFLICT per gestire la prima riga (counter row creata
-- lazily). GREATEST(...,0) sul DELETE per defensive clamp (nel caso di
-- backfill / fix manuali che potrebbero portare a valori inconsistenti).
CREATE OR REPLACE FUNCTION user_follows_sync_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO user_social_counters (user_id, following_count, updated_at)
      VALUES (NEW.follower_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET following_count = user_social_counters.following_count + 1,
            updated_at = now();
    INSERT INTO user_social_counters (user_id, followers_count, updated_at)
      VALUES (NEW.followed_id, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET followers_count = user_social_counters.followers_count + 1,
            updated_at = now();
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE user_social_counters
      SET following_count = GREATEST(following_count - 1, 0),
          updated_at = now()
      WHERE user_id = OLD.follower_id;
    UPDATE user_social_counters
      SET followers_count = GREATEST(followers_count - 1, 0),
          updated_at = now()
      WHERE user_id = OLD.followed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_follows_sync_counters_trg ON user_follows;
CREATE TRIGGER user_follows_sync_counters_trg
AFTER INSERT OR DELETE ON user_follows
FOR EACH ROW EXECUTE FUNCTION user_follows_sync_counters();

-- ───────────────────────────────────────────────────────────────────────
-- Backfill: nessuno (tabella nuova). Se in futuro reseedi follows da
-- import esterno, fai INSERT con bulk e i trigger faranno UPSERT in
-- riga per riga. Per import massivo prendi in considerazione di
-- disabilitare il trigger e ricalcolare i counter con query aggregata.
-- ───────────────────────────────────────────────────────────────────────

COMMIT;
