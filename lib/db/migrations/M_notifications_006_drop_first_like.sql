-- =============================================================================
-- Module: Notifications — 006 drop achievement.first_like
-- =============================================================================
--
-- Decisione product 2026-05-26: la notifica "prima reazione al tuo post"
-- è troppo rumorosa nella formulazione per-post (ogni nuovo post = nuova
-- "prima reazione"). Eliminata del tutto; restano solo i milestone viral_*
-- che sono aggregati e semanticamente rari.
--
-- Steps:
--   1) Riscrive posts_reactions_counter_trg senza il blocco first_like.
--   2) Riscrive notifications_fanout_from_outbox senza il case dedicato.
--   3) Pulisce notifiche storiche, settings, e outbox pending del type.
--
-- La colonna posts.achievements_emitted resta (usata da viral_*).
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1) Trigger reactions: solo viral_likes ────────────────────────────────
CREATE OR REPLACE FUNCTION posts_reactions_counter_trg() RETURNS trigger AS $$
DECLARE
  v_post_id           uuid;
  v_reaction          varchar(16);
  v_delta             int;
  v_total             int;
  v_emitted           jsonb;
  v_author_id         uuid;
  v_created_at        timestamptz;
  v_viral_enabled     boolean;
  v_viral_threshold   int;
  v_viral_window_hrs  int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_post_id  := NEW.post_id;
    v_reaction := NEW.reaction;
    v_delta    := 1;
  ELSE
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

  IF TG_OP <> 'INSERT' THEN
    RETURN NULL;
  END IF;

  SELECT
    reactions_like + reactions_bullish + reactions_bearish + reactions_to_the_moon + reactions_dump,
    achievements_emitted,
    author_id,
    created_at
  INTO v_total, v_emitted, v_author_id, v_created_at
  FROM posts WHERE id = v_post_id;

  SELECT COALESCE(value, 'true') = 'true'
    INTO v_viral_enabled
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_likes_enabled';
  v_viral_enabled := COALESCE(v_viral_enabled, true);

  SELECT NULLIF(value, '')::int
    INTO v_viral_threshold
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_likes_threshold';
  v_viral_threshold := COALESCE(v_viral_threshold, 50);

  SELECT NULLIF(value, '')::int
    INTO v_viral_window_hrs
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.viral_likes_window_hours';
  v_viral_window_hrs := COALESCE(v_viral_window_hrs, 24);

  IF v_viral_enabled
     AND v_total >= v_viral_threshold
     AND NOT (v_emitted ? 'viral_likes')
     AND v_created_at > NOW() - (v_viral_window_hrs || ' hours')::interval THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'achievement.post_viral_likes',
      jsonb_build_object(
        'post_id',     v_post_id,
        'author_id',   v_author_id,
        'kind',        'viral_likes',
        'total_count', v_total,
        'threshold',   v_viral_threshold,
        'window_hrs',  v_viral_window_hrs
      )
    );
    UPDATE posts
       SET achievements_emitted = jsonb_set(achievements_emitted, '{viral_likes}', to_jsonb(NOW()::text))
     WHERE id = v_post_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── 2) Fanout: rimuovi case achievement.first_like ────────────────────────
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

    WHEN 'achievement.post_viral_likes',
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

-- ── 3) Cleanup ────────────────────────────────────────────────────────────
DELETE FROM notifications WHERE type = 'achievement.first_like';

UPDATE posts_outbox
   SET processed_at = NOW()
 WHERE event_type = 'achievement.first_like'
   AND processed_at IS NULL;

DELETE FROM app_settings WHERE key IN (
  'modules.notifications.achievements.first_like_enabled',
  'modules.notifications.email_achievement_first_like_subject',
  'modules.notifications.email_achievement_first_like_body',
  'modules.notifications.email_achievement_first_like_footer'
);

COMMIT;
