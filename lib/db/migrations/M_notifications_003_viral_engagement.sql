-- =============================================================================
-- Module: Notifications — 003 viral comments + viral reposts
-- =============================================================================
--
-- Estende il pattern achievement push (M_notifications_002) alle altre
-- 2 tipologie di engagement: commenti e repost. Stesso modello:
--   - check inline nel counter trigger esistente
--   - posts.achievements_emitted JSONB per anti-spam (1 emit per kind)
--   - soglie configurabili da app_settings
--
-- Achievement V2 (additivi a V1):
--   - achievement.post_viral_comments → ≥ N commenti entro W ore
--   - achievement.post_viral_reposts  → ≥ N repost entro W ore
--
-- Counter usati:
--   - posts.comments_count   (aggiornato da posts_comments_counter_trg)
--   - posts.reposts_count    (aggiornato da posts_repost_counter_trg sul TARGET)
--
-- Settings (in app_settings, namespace modules.notifications.achievements.*):
--   - viral_comments_enabled         ('true' | 'false', default 'true')
--   - viral_comments_threshold       int >= 1 (default '10')
--   - viral_comments_window_hours    int >= 1 (default '24')
--   - viral_reposts_enabled          ('true' | 'false', default 'true')
--   - viral_reposts_threshold        int >= 1 (default '5')
--   - viral_reposts_window_hours     int >= 1 (default '24')
--
-- NOTA importante per repost: il counter `reposts_count` vive sul POST
-- TARGET (chi è stato citato), non sul quote post. L'achievement
-- notification va all'autore del TARGET — coerente con la semantica
-- "il tuo post sta venendo citato molto".
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1) Estendi posts_comments_counter_trg con check viral_comments ──────
CREATE OR REPLACE FUNCTION posts_comments_counter_trg() RETURNS trigger AS $$
DECLARE
  v_target_post_id    uuid;
  v_total             int;
  v_emitted           jsonb;
  v_author_id         uuid;
  v_created_at        timestamptz;
  v_viral_enabled     boolean;
  v_viral_threshold   int;
  v_viral_window_hrs  int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
  END IF;

  -- Achievement check: solo su INSERT con commento non soft-deleted
  IF TG_OP <> 'INSERT' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_target_post_id := NEW.post_id;

  SELECT comments_count, achievements_emitted, author_id, created_at
  INTO v_total, v_emitted, v_author_id, v_created_at
  FROM posts WHERE id = v_target_post_id;

  SELECT COALESCE(value, 'true') = 'true'
    INTO v_viral_enabled
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_comments_enabled';
  v_viral_enabled := COALESCE(v_viral_enabled, true);

  SELECT NULLIF(value, '')::int
    INTO v_viral_threshold
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_comments_threshold';
  v_viral_threshold := COALESCE(v_viral_threshold, 10);

  SELECT NULLIF(value, '')::int
    INTO v_viral_window_hrs
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_comments_window_hours';
  v_viral_window_hrs := COALESCE(v_viral_window_hrs, 24);

  IF v_viral_enabled
     AND v_total >= v_viral_threshold
     AND NOT (v_emitted ? 'viral_comments')
     AND v_created_at > NOW() - (v_viral_window_hrs || ' hours')::interval THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'achievement.post_viral_comments',
      jsonb_build_object(
        'post_id',     v_target_post_id,
        'author_id',   v_author_id,
        'kind',        'viral_comments',
        'total_count', v_total,
        'threshold',   v_viral_threshold,
        'window_hrs',  v_viral_window_hrs
      )
    );
    UPDATE posts
       SET achievements_emitted = jsonb_set(achievements_emitted, '{viral_comments}', to_jsonb(NOW()::text))
     WHERE id = v_target_post_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── 2) Estendi posts_repost_counter_trg con check viral_reposts ─────────
-- Importante: il check è sul TARGET del repost (chi è stato citato),
-- non sul quote post nuovo. Il counter `reposts_count` è già del target.
CREATE OR REPLACE FUNCTION posts_repost_counter_trg() RETURNS trigger AS $$
DECLARE
  v_target_post_id    uuid;
  v_total             int;
  v_emitted           jsonb;
  v_author_id         uuid;
  v_created_at        timestamptz;
  v_viral_enabled     boolean;
  v_viral_threshold   int;
  v_viral_window_hrs  int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.repost_of_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.repost_of_id IS NOT NULL OR OLD.repost_of_id IS NOT NULL THEN
      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
         AND OLD.repost_of_id IS NOT NULL THEN
        UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.repost_of_id;
      ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
            AND NEW.repost_of_id IS NOT NULL THEN
        UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.repost_of_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
      UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.repost_of_id;
    END IF;
  END IF;

  -- Achievement check: solo su INSERT di nuovo quote repost
  IF TG_OP <> 'INSERT' OR NEW.repost_of_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_target_post_id := NEW.repost_of_id;

  SELECT reposts_count, achievements_emitted, author_id, created_at
  INTO v_total, v_emitted, v_author_id, v_created_at
  FROM posts WHERE id = v_target_post_id;

  SELECT COALESCE(value, 'true') = 'true'
    INTO v_viral_enabled
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_reposts_enabled';
  v_viral_enabled := COALESCE(v_viral_enabled, true);

  SELECT NULLIF(value, '')::int
    INTO v_viral_threshold
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_reposts_threshold';
  v_viral_threshold := COALESCE(v_viral_threshold, 5);

  SELECT NULLIF(value, '')::int
    INTO v_viral_window_hrs
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_reposts_window_hours';
  v_viral_window_hrs := COALESCE(v_viral_window_hrs, 24);

  IF v_viral_enabled
     AND v_total >= v_viral_threshold
     AND NOT (v_emitted ? 'viral_reposts')
     AND v_created_at > NOW() - (v_viral_window_hrs || ' hours')::interval THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'achievement.post_viral_reposts',
      jsonb_build_object(
        'post_id',     v_target_post_id,
        'author_id',   v_author_id,
        'kind',        'viral_reposts',
        'total_count', v_total,
        'threshold',   v_viral_threshold,
        'window_hrs',  v_viral_window_hrs
      )
    );
    UPDATE posts
       SET achievements_emitted = jsonb_set(achievements_emitted, '{viral_reposts}', to_jsonb(NOW()::text))
     WHERE id = v_target_post_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── 3) Estendi notifications_fanout_from_outbox per i 2 nuovi types ─────
CREATE OR REPLACE FUNCTION notifications_fanout_from_outbox() RETURNS trigger AS $$
DECLARE
  v_recipient_id    uuid;
  v_actor_id        uuid;
  v_post_id         uuid;
  v_comment_id      uuid;
  v_dedup_minutes   int;
BEGIN
  SELECT NULLIF(value, '')::int INTO v_dedup_minutes
  FROM app_settings
  WHERE key = 'modules.notifications.dedup_window_minutes';
  v_dedup_minutes := COALESCE(v_dedup_minutes, 60);

  CASE NEW.event_type
    WHEN 'post.reaction.added' THEN
      v_post_id  := (NEW.payload->>'post_id')::uuid;
      v_actor_id := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    WHEN 'post.comment.created' THEN
      v_post_id    := (NEW.payload->>'post_id')::uuid;
      v_comment_id := (NEW.payload->>'comment_id')::uuid;
      v_actor_id   := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    WHEN 'post.comment.reaction.added' THEN
      v_comment_id := (NEW.payload->>'comment_id')::uuid;
      v_post_id    := (NEW.payload->>'post_id')::uuid;
      v_actor_id   := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts_comments WHERE id = v_comment_id;

    WHEN 'post.mention' THEN
      v_post_id       := (NEW.payload->>'post_id')::uuid;
      v_recipient_id  := (NEW.payload->>'mentioned_user_id')::uuid;
      SELECT author_id INTO v_actor_id FROM posts WHERE id = v_post_id;

    WHEN 'post.repost.created' THEN
      v_post_id  := (NEW.payload->>'target_post_id')::uuid;
      v_actor_id := (NEW.payload->>'actor_id')::uuid;
      SELECT author_id INTO v_recipient_id FROM posts WHERE id = v_post_id;

    -- Achievement events: recipient = autore del post, actor = NULL.
    WHEN 'achievement.first_like',
         'achievement.post_viral_likes',
         'achievement.post_viral_comments',
         'achievement.post_viral_reposts' THEN
      v_post_id      := (NEW.payload->>'post_id')::uuid;
      v_recipient_id := (NEW.payload->>'author_id')::uuid;
      v_actor_id     := NULL;

    ELSE
      UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
      RETURN NEW;
  END CASE;

  IF v_recipient_id IS NULL OR v_recipient_id = v_actor_id THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM 1 FROM notifications
  WHERE user_id    = v_recipient_id
    AND type       = NEW.event_type
    AND post_id    IS NOT DISTINCT FROM v_post_id
    AND actor_id   IS NOT DISTINCT FROM v_actor_id
    AND created_at > NOW() - (v_dedup_minutes || ' minutes')::interval
  LIMIT 1;
  IF FOUND THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, actor_id, post_id, comment_id, payload)
  VALUES (v_recipient_id, NEW.event_type, v_actor_id, v_post_id, v_comment_id, NEW.payload);

  UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
