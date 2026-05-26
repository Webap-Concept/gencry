-- =============================================================================
-- Module: Notifications — 002 achievements (trigger-based push)
-- =============================================================================
--
-- Motivazione (decisione product 2026-05-26):
--   Le email "per ogni azione" generano alto rumore → l'utente disabilita
--   il canale. Strategia ibrida: in-app realtime sempre, email solo su
--   MILESTONE significativi (achievement). Niente cron polling — i
--   trigger DB esistenti rilevano il crossing della soglia inline col
--   counter update e emettono `posts_outbox` event.
--
-- Achievement V1 (estendibile via app_settings):
--   - achievement.first_like              → primo like in assoluto sul post
--   - achievement.post_viral_likes        → soglia like in window (default
--                                          50 in 24h, configurabile)
--
-- Pattern anti-spam:
--   `posts.achievements_emitted JSONB` tiene traccia dei kind già emessi
--   per post. Il check `NOT (achievements_emitted ? '<kind>')` garantisce
--   1 sola emissione per kind per post, anche se il counter oscilla.
--
-- Settings (in app_settings, namespace modules.notifications.achievements.*):
--   - first_like_enabled              ('true' | 'false', default 'true')
--   - viral_likes_enabled             ('true' | 'false', default 'true')
--   - viral_likes_threshold           int >= 1 (default '50')
--   - viral_likes_window_hours        int >= 1 (default '24')
--
-- Idempotente. Da incollare in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1) Colonna achievements_emitted su posts ─────────────────────────────
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "achievements_emitted" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 2) Rewrite posts_reactions_counter_trg con check achievement inline ──
-- Sostituisce la versione di M_posts_008 — stessa logica counter PLUS
-- check soglie achievement dopo l'UPDATE. Atomico in singola transaction.
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

  -- Update counter specifico (immutato vs M_posts_008)
  CASE v_reaction
    WHEN 'like'        THEN UPDATE posts SET reactions_like        = GREATEST(reactions_like        + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bullish'     THEN UPDATE posts SET reactions_bullish     = GREATEST(reactions_bullish     + v_delta, 0) WHERE id = v_post_id;
    WHEN 'bearish'     THEN UPDATE posts SET reactions_bearish     = GREATEST(reactions_bearish     + v_delta, 0) WHERE id = v_post_id;
    WHEN 'to_the_moon' THEN UPDATE posts SET reactions_to_the_moon = GREATEST(reactions_to_the_moon + v_delta, 0) WHERE id = v_post_id;
    WHEN 'dump'        THEN UPDATE posts SET reactions_dump        = GREATEST(reactions_dump        + v_delta, 0) WHERE id = v_post_id;
  END CASE;

  -- Achievement check: solo su INSERT (delete non triggera milestone)
  IF TG_OP <> 'INSERT' THEN
    RETURN NULL;
  END IF;

  -- Leggi stato post + achievement emessi (1 SELECT, PK lookup → O(1))
  SELECT
    reactions_like + reactions_bullish + reactions_bearish + reactions_to_the_moon + reactions_dump,
    achievements_emitted,
    author_id,
    created_at
  INTO v_total, v_emitted, v_author_id, v_created_at
  FROM posts WHERE id = v_post_id;

  -- Leggi config achievement da app_settings (PK lookup, cheap)
  -- Default conservativi se settings missing/invalid.
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

  -- Achievement: first_like (esattamente 1 reaction totale e mai emesso)
  IF v_first_enabled
     AND v_total = 1
     AND NOT (v_emitted ? 'first_like') THEN
    INSERT INTO posts_outbox (event_type, payload)
    VALUES (
      'achievement.first_like',
      jsonb_build_object(
        'post_id',    v_post_id,
        'author_id',  v_author_id,
        'kind',       'first_like'
      )
    );
    UPDATE posts
       SET achievements_emitted = jsonb_set(achievements_emitted, '{first_like}', to_jsonb(NOW()::text))
     WHERE id = v_post_id;
  END IF;

  -- Achievement: viral_likes (>= threshold reactions entro window dalla pubblicazione)
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

-- ── 3) Estendere notifications_fanout_from_outbox per achievement.* ──────
-- Aggiunge il branch achievement al switch event_type. Recipient = autore
-- del post (self-notify: il sistema notifica il proprio achievement —
-- semantica corretta, dedup check `v_recipient_id = v_actor_id` con
-- v_actor_id = NULL non scatta).
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

    -- ── NUOVO V2 (achievement) ──────────────────────────────────────────
    WHEN 'achievement.first_like', 'achievement.post_viral_likes' THEN
      v_post_id      := (NEW.payload->>'post_id')::uuid;
      v_recipient_id := (NEW.payload->>'author_id')::uuid;
      v_actor_id     := NULL;  -- evento di sistema, niente actor umano

    ELSE
      UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
      RETURN NEW;
  END CASE;

  -- Skip se no recipient OR actor == recipient (self-notify reaction su
  -- proprio post). Per achievement v_actor_id è NULL → non skippa.
  IF v_recipient_id IS NULL OR v_recipient_id = v_actor_id THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Dedup window
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
