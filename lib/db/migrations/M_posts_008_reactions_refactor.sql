-- =============================================================================
-- Module: Posts (social feed) — 008 reactions refactor + comment reactions
-- =============================================================================
-- 1) Refactor del set di reactions sui post:
--      RIMOSSO  diamond (la sua icona diamante passa a "like")
--      RINOMINATO bull   → bullish
--      RINOMINATO bear   → bearish
--      RINOMINATO rocket → to_the_moon
--      KEEP      like, dump
--
--    Set finale (5):  like | bullish | bearish | to_the_moon | dump
--
-- 2) Aggiunta reactions sui commenti:
--      NUOVA TABELLA posts_comment_reactions  (stessa shape di posts_reactions)
--      ADD COLS    posts_comments.reactions_*  (5 colonne counter denorm)
--      NEW TRIGGER posts_comment_reactions_counter_trg (gemello di
--                  posts_reactions_counter_trg ma su posts_comments)
--      NEW TRIGGER posts_comment_reactions_outbox_trg (emette
--                  'post.comment.reaction.added' su posts_outbox)
--
-- Dati esistenti: convenzione dev (alpha, no prod data). Strategia:
--   - row in posts_reactions con reaction='diamond'  → DELETE
--   - row con reaction IN ('bull','bear','rocket')   → UPDATE rinominate
--   La colonna posts.reactions_diamond → DROP (i counter sono ricomputati
--   automaticamente dal trigger sui nuovi INSERT/DELETE, ma le 4 colonne
--   restano integre per i kind preservati).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) posts_reactions: rinominare valori + drop diamond + nuovo CHECK ─────
ALTER TABLE "posts_reactions" DROP CONSTRAINT IF EXISTS "posts_reactions_kind_chk";

DELETE FROM "posts_reactions" WHERE "reaction" = 'diamond';

UPDATE "posts_reactions" SET "reaction" = 'bullish'     WHERE "reaction" = 'bull';
UPDATE "posts_reactions" SET "reaction" = 'bearish'     WHERE "reaction" = 'bear';
UPDATE "posts_reactions" SET "reaction" = 'to_the_moon' WHERE "reaction" = 'rocket';

ALTER TABLE "posts_reactions"
  ADD CONSTRAINT "posts_reactions_kind_chk"
  CHECK ("reaction" IN ('like','bullish','bearish','to_the_moon','dump'));

-- ── 2) posts: rinominare colonne counter + drop reactions_diamond ─────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='posts' AND column_name='reactions_bull'
  ) THEN
    EXECUTE 'ALTER TABLE "posts" RENAME COLUMN "reactions_bull" TO "reactions_bullish"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='posts' AND column_name='reactions_bear'
  ) THEN
    EXECUTE 'ALTER TABLE "posts" RENAME COLUMN "reactions_bear" TO "reactions_bearish"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='posts' AND column_name='reactions_rocket'
  ) THEN
    EXECUTE 'ALTER TABLE "posts" RENAME COLUMN "reactions_rocket" TO "reactions_to_the_moon"';
  END IF;
END$$;

ALTER TABLE "posts" DROP COLUMN IF EXISTS "reactions_diamond";

-- ── 3) Sostituire la trigger function counters per posts_reactions ─────────
CREATE OR REPLACE FUNCTION posts_reactions_counter_trg() RETURNS trigger AS $$
DECLARE
  v_post_id  uuid;
  v_reaction varchar(16);
  v_delta    int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_post_id  := NEW.post_id;
    v_reaction := NEW.reaction;
    v_delta    := 1;
  ELSE  -- DELETE
    v_post_id  := OLD.post_id;
    v_reaction := OLD.reaction;
    v_delta    := -1;
  END IF;

  CASE v_reaction
    WHEN 'like'        THEN UPDATE posts SET reactions_like        = GREATEST(reactions_like        + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bullish'     THEN UPDATE posts SET reactions_bullish     = GREATEST(reactions_bullish     + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bearish'     THEN UPDATE posts SET reactions_bearish     = GREATEST(reactions_bearish     + v_delta, 0) WHERE id = v_post_id;
    WHEN 'to_the_moon' THEN UPDATE posts SET reactions_to_the_moon = GREATEST(reactions_to_the_moon + v_delta, 0) WHERE id = v_post_id;
    WHEN 'dump'        THEN UPDATE posts SET reactions_dump        = GREATEST(reactions_dump        + v_delta, 0) WHERE id = v_post_id;
  END CASE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── 4) posts_comments: aggiungere 5 counter denorm ─────────────────────────
ALTER TABLE "posts_comments"
  ADD COLUMN IF NOT EXISTS "reactions_like"        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reactions_bullish"     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reactions_bearish"     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reactions_to_the_moon" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reactions_dump"        integer NOT NULL DEFAULT 0;

-- ── 5) Nuova tabella posts_comment_reactions ──────────────────────────────
CREATE TABLE IF NOT EXISTS "posts_comment_reactions" (
  "comment_id"  uuid          NOT NULL REFERENCES "posts_comments"("id") ON DELETE CASCADE,
  "user_id"     uuid          NOT NULL REFERENCES "users"("id")          ON DELETE CASCADE,
  "reaction"    varchar(16)   NOT NULL,
  "created_at"  timestamptz   NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("comment_id", "user_id", "reaction"),
  CONSTRAINT "posts_comment_reactions_kind_chk"
    CHECK ("reaction" IN ('like','bullish','bearish','to_the_moon','dump'))
);

CREATE INDEX IF NOT EXISTS "idx_posts_comment_reactions_comment_kind"
  ON "posts_comment_reactions" ("comment_id", "reaction");

CREATE INDEX IF NOT EXISTS "idx_posts_comment_reactions_user_recent"
  ON "posts_comment_reactions" ("user_id", "created_at" DESC);

-- ── 6) Trigger counter per posts_comment_reactions ─────────────────────────
CREATE OR REPLACE FUNCTION posts_comment_reactions_counter_trg() RETURNS trigger AS $$
DECLARE
  v_comment_id uuid;
  v_reaction   varchar(16);
  v_delta      int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_comment_id := NEW.comment_id;
    v_reaction   := NEW.reaction;
    v_delta      := 1;
  ELSE  -- DELETE
    v_comment_id := OLD.comment_id;
    v_reaction   := OLD.reaction;
    v_delta      := -1;
  END IF;

  CASE v_reaction
    WHEN 'like'        THEN UPDATE posts_comments SET reactions_like        = GREATEST(reactions_like        + v_delta, 0) WHERE id = v_comment_id;
    WHEN 'bullish'     THEN UPDATE posts_comments SET reactions_bullish     = GREATEST(reactions_bullish     + v_delta, 0) WHERE id = v_comment_id;
    WHEN 'bearish'     THEN UPDATE posts_comments SET reactions_bearish     = GREATEST(reactions_bearish     + v_delta, 0) WHERE id = v_comment_id;
    WHEN 'to_the_moon' THEN UPDATE posts_comments SET reactions_to_the_moon = GREATEST(reactions_to_the_moon + v_delta, 0) WHERE id = v_comment_id;
    WHEN 'dump'        THEN UPDATE posts_comments SET reactions_dump        = GREATEST(reactions_dump        + v_delta, 0) WHERE id = v_comment_id;
  END CASE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_comment_reactions_counter_ai ON posts_comment_reactions;
CREATE TRIGGER posts_comment_reactions_counter_ai
  AFTER INSERT ON posts_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_comment_reactions_counter_trg();

DROP TRIGGER IF EXISTS posts_comment_reactions_counter_ad ON posts_comment_reactions;
CREATE TRIGGER posts_comment_reactions_counter_ad
  AFTER DELETE ON posts_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_comment_reactions_counter_trg();

-- ── 7) Trigger outbox per posts_comment_reactions (INSERT only) ────────────
-- Coerente con il pattern di posts_reactions_outbox_trg in M_posts_002.
-- Emette 'post.comment.reaction.added' che il futuro modulo notifications
-- consumerà per notificare l'autore del commento.
CREATE OR REPLACE FUNCTION posts_comment_reactions_outbox_trg() RETURNS trigger AS $$
DECLARE
  v_post_id uuid;
BEGIN
  -- Recuperare post_id del commento per renderlo disponibile nel payload
  -- (utile per costruire deeplink /post/{id}#comment-{id}).
  SELECT post_id INTO v_post_id FROM posts_comments WHERE id = NEW.comment_id;

  INSERT INTO posts_outbox (event_type, payload)
  VALUES (
    'post.comment.reaction.added',
    jsonb_build_object(
      'comment_id', NEW.comment_id,
      'post_id',    v_post_id,
      'actor_id',   NEW.user_id,
      'reaction',   NEW.reaction,
      'created_at', NEW.created_at
    )
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_comment_reactions_outbox_ai ON posts_comment_reactions;
CREATE TRIGGER posts_comment_reactions_outbox_ai
  AFTER INSERT ON posts_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_comment_reactions_outbox_trg();
