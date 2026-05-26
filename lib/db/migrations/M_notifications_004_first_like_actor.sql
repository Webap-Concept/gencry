-- =============================================================================
-- Module: Notifications — 004 first_like actor attribution
-- =============================================================================
--
-- Fix UX di M_notifications_002: per achievement.first_like la notifica
-- mostrava avatar fallback "?" perché actor_id era NULL (pattern V1
-- "evento di sistema"). Ma per first_like c'è UNO specifico utente che
-- ha causato l'evento (quello che ha messo la prima reazione) → ha
-- senso attribuirgli la notifica.
--
-- Per viral_likes / viral_comments / viral_reposts l'actor resta NULL:
-- sono fenomeni AGGREGATI ("50 reazioni totali"), non c'è un singolo
-- attore semanticamente rilevante. La favicon del sito fa da fallback
-- visuale UI-side per quei tipi.
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1) Aggiorna posts_reactions_counter_trg: includi actor_id ────────────
-- nel payload dell'event achievement.first_like.
CREATE OR REPLACE FUNCTION posts_reactions_counter_trg() RETURNS trigger AS $$
DECLARE
  v_post_id           uuid;
  v_reaction          varchar(16);
  v_delta             int;
  v_total             int;
  v_emitted           jsonb;
  v_author_id         uuid;
  v_created_at        timestamptz;
  v_first_enabled     boolean;
  v_viral_enabled     boolean;
  v_viral_threshold   int;
  v_viral_window_hrs  int;
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
    INTO v_first_enabled
    FROM app_settings
    WHERE key = 'modules.notifications.achievements.first_like_enabled';
  v_first_enabled := COALESCE(v_first_enabled, true);

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

  -- Achievement: first_like → include actor_id (NEW.user_id)
  IF v_first_enabled
     AND v_total = 1
     AND NOT (v_emitted ? 'first_like') THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'achievement.first_like',
      jsonb_build_object(
        'post_id',   v_post_id,
        'author_id', v_author_id,
        'actor_id',  NEW.user_id,   -- NEW V4: chi ha messo la prima reazione
        'reaction',  NEW.reaction,
        'kind',      'first_like'
      )
    );
    UPDATE posts
       SET achievements_emitted = jsonb_set(achievements_emitted, '{first_like}', to_jsonb(NOW()::text))
     WHERE id = v_post_id;
  END IF;

  -- Achievement: viral_likes → actor stays NULL (aggregate event)
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

-- ── 2) Aggiorna fanout: per achievement.first_like usa payload.actor_id ─
-- viral_* + first_like ora coesistono con semantiche diverse:
--   - first_like        → actor = payload.actor_id (l'utente del reactor)
--   - post_viral_likes  → actor = NULL (sistema, evento aggregato)
--   - post_viral_*      → actor = NULL (idem)
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

    -- Achievement: first_like ha actor reale (chi ha messo la prima
    -- reazione). Viral_* restano evento di sistema (actor NULL).
    WHEN 'achievement.first_like' THEN
      v_post_id      := (NEW.payload->>'post_id')::uuid;
      v_recipient_id := (NEW.payload->>'author_id')::uuid;
      v_actor_id     := NULLIF(NEW.payload->>'actor_id', '')::uuid;

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

COMMIT;
