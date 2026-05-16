-- =============================================================================
-- Module: Posts (social feed) — 002 triggers (counters + outbox)
-- =============================================================================
-- Aggiunge i trigger DB che tengono consistenti:
--   1) i 9 counter denormalizzati su `posts` (reactions × 6, comments,
--      reposts, bookmarks) — aggiornati da INSERT/DELETE/soft-delete sulle
--      tabelle figlie.
--   2) la coda `posts_outbox` — popolata dagli eventi che il modulo
--      `notifications` futuro dovrà consumare (reazioni aggiunte, commenti,
--      menzioni, repost).
--
-- Astrazione: V1 = trigger DB (questa migration). V2 = write-behind via
-- queue, swap dell'impl SENZA toccare i consumer (Server Action di PR-3
-- chiama `services/reactions.addReaction()` che fa db.insert e basta —
-- domani lo stesso service può anche enqueueare).
--
-- Soft-delete semantics:
--   - posts_comments: il counter decrementa sulla TRANSIZIONE deleted_at
--     NULL → NOT NULL (soft delete) e incrementa sul restore.
--   - posts (quote repost): stessa logica su reposts_count del target.
--   - I trigger usano GREATEST(counter - 1, 0) come safety net contro
--     drift negativi in caso di concorrenza patologica.
--
-- Outbox events emessi (solo `added/created`, no remove — il modulo
-- notifications notifica nuove interazioni, non rimozioni):
--   - post.reaction.added         payload { post_id, actor_id, reaction, created_at }
--   - post.comment.created        payload { comment_id, post_id, actor_id, parent_comment_id, created_at }
--   - post.mention                payload { post_id, mentioned_user_id, created_at }
--   - post.repost.created         payload { post_id, target_post_id, actor_id, created_at }
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Counter trigger — posts_reactions ──────────────────────────────────
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
    WHEN 'like'    THEN UPDATE posts SET reactions_like    = GREATEST(reactions_like    + v_delta, 0) WHERE id = v_post_id;
    WHEN 'rocket'  THEN UPDATE posts SET reactions_rocket  = GREATEST(reactions_rocket  + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bull'    THEN UPDATE posts SET reactions_bull    = GREATEST(reactions_bull    + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bear'    THEN UPDATE posts SET reactions_bear    = GREATEST(reactions_bear    + v_delta, 0) WHERE id = v_post_id;
    WHEN 'dump'    THEN UPDATE posts SET reactions_dump    = GREATEST(reactions_dump    + v_delta, 0) WHERE id = v_post_id;
    WHEN 'diamond' THEN UPDATE posts SET reactions_diamond = GREATEST(reactions_diamond + v_delta, 0) WHERE id = v_post_id;
  END CASE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_reactions_counter_ai ON posts_reactions;
CREATE TRIGGER posts_reactions_counter_ai
  AFTER INSERT ON posts_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_reactions_counter_trg();

DROP TRIGGER IF EXISTS posts_reactions_counter_ad ON posts_reactions;
CREATE TRIGGER posts_reactions_counter_ad
  AFTER DELETE ON posts_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_reactions_counter_trg();

-- ── 2) Counter trigger — posts_comments (soft-delete aware) ───────────────
CREATE OR REPLACE FUNCTION posts_comments_counter_trg() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Solo se non già cancellato (insert con deleted_at NULL = caso standard)
    IF NEW.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transizione NULL → NOT NULL: soft delete
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = NEW.post_id;
    -- Transizione NOT NULL → NULL: restore
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Hard delete (cascade): decrementa solo se non era già soft-cancellato
    IF OLD.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_comments_counter_ai  ON posts_comments;
CREATE TRIGGER posts_comments_counter_ai
  AFTER INSERT ON posts_comments
  FOR EACH ROW EXECUTE FUNCTION posts_comments_counter_trg();

DROP TRIGGER IF EXISTS posts_comments_counter_au  ON posts_comments;
CREATE TRIGGER posts_comments_counter_au
  AFTER UPDATE OF deleted_at ON posts_comments
  FOR EACH ROW EXECUTE FUNCTION posts_comments_counter_trg();

DROP TRIGGER IF EXISTS posts_comments_counter_ad  ON posts_comments;
CREATE TRIGGER posts_comments_counter_ad
  AFTER DELETE ON posts_comments
  FOR EACH ROW EXECUTE FUNCTION posts_comments_counter_trg();

-- ── 3) Counter trigger — posts_bookmarks ──────────────────────────────────
CREATE OR REPLACE FUNCTION posts_bookmarks_counter_trg() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id;
  ELSE  -- DELETE
    UPDATE posts SET bookmarks_count = GREATEST(bookmarks_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_bookmarks_counter_ai ON posts_bookmarks;
CREATE TRIGGER posts_bookmarks_counter_ai
  AFTER INSERT ON posts_bookmarks
  FOR EACH ROW EXECUTE FUNCTION posts_bookmarks_counter_trg();

DROP TRIGGER IF EXISTS posts_bookmarks_counter_ad ON posts_bookmarks;
CREATE TRIGGER posts_bookmarks_counter_ad
  AFTER DELETE ON posts_bookmarks
  FOR EACH ROW EXECUTE FUNCTION posts_bookmarks_counter_trg();

-- ── 4) Counter trigger — reposts_count sul target del quote repost ────────
CREATE OR REPLACE FUNCTION posts_repost_counter_trg() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.repost_of_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Solo per posts che sono quote repost
    IF NEW.repost_of_id IS NOT NULL OR OLD.repost_of_id IS NOT NULL THEN
      -- Soft delete del repost: NULL → NOT NULL
      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
         AND OLD.repost_of_id IS NOT NULL THEN
        UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.repost_of_id;
      -- Restore: NOT NULL → NULL
      ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            AND NEW.repost_of_id IS NOT NULL THEN
        UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Hard delete: decrementa solo se il repost era visibile
    IF OLD.repost_of_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
      UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.repost_of_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_repost_counter_ai ON posts;
CREATE TRIGGER posts_repost_counter_ai
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_repost_counter_trg();

DROP TRIGGER IF EXISTS posts_repost_counter_au ON posts;
CREATE TRIGGER posts_repost_counter_au
  AFTER UPDATE OF deleted_at ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_repost_counter_trg();

DROP TRIGGER IF EXISTS posts_repost_counter_ad ON posts;
CREATE TRIGGER posts_repost_counter_ad
  AFTER DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_repost_counter_trg();

-- ── 5) Outbox emit — posts_reactions (INSERT only) ────────────────────────
CREATE OR REPLACE FUNCTION posts_reactions_outbox_trg() RETURNS trigger AS $$
BEGIN
  INSERT INTO posts_outbox (event_type, payload)
  VALUES (
    'post.reaction.added',
    jsonb_build_object(
      'post_id',    NEW.post_id,
      'actor_id',   NEW.user_id,
      'reaction',   NEW.reaction,
      'created_at', NEW.created_at
    )
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_reactions_outbox_ai ON posts_reactions;
CREATE TRIGGER posts_reactions_outbox_ai
  AFTER INSERT ON posts_reactions
  FOR EACH ROW EXECUTE FUNCTION posts_reactions_outbox_trg();

-- ── 6) Outbox emit — posts_comments (INSERT only, e solo se non soft) ─────
CREATE OR REPLACE FUNCTION posts_comments_outbox_trg() RETURNS trigger AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'post.comment.created',
      jsonb_build_object(
        'comment_id',        NEW.id,
        'post_id',           NEW.post_id,
        'actor_id',          NEW.author_id,
        'parent_comment_id', NEW.parent_comment_id,
        'created_at',        NEW.created_at
      )
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_comments_outbox_ai ON posts_comments;
CREATE TRIGGER posts_comments_outbox_ai
  AFTER INSERT ON posts_comments
  FOR EACH ROW EXECUTE FUNCTION posts_comments_outbox_trg();

-- ── 7) Outbox emit — posts_mentions ───────────────────────────────────────
CREATE OR REPLACE FUNCTION posts_mentions_outbox_trg() RETURNS trigger AS $$
BEGIN
  INSERT INTO posts_outbox (event_type, payload)
  VALUES (
    'post.mention',
    jsonb_build_object(
      'post_id',            NEW.post_id,
      'mentioned_user_id',  NEW.mentioned_user_id,
      'created_at',         NEW.created_at
    )
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_mentions_outbox_ai ON posts_mentions;
CREATE TRIGGER posts_mentions_outbox_ai
  AFTER INSERT ON posts_mentions
  FOR EACH ROW EXECUTE FUNCTION posts_mentions_outbox_trg();

-- ── 8) Outbox emit — quote repost INSERT su posts ─────────────────────────
CREATE OR REPLACE FUNCTION posts_repost_outbox_trg() RETURNS trigger AS $$
BEGIN
  IF NEW.repost_of_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'post.repost.created',
      jsonb_build_object(
        'post_id',        NEW.id,
        'target_post_id', NEW.repost_of_id,
        'actor_id',       NEW.author_id,
        'created_at',     NEW.created_at
      )
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_repost_outbox_ai ON posts;
CREATE TRIGGER posts_repost_outbox_ai
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_repost_outbox_trg();
