-- =============================================================================
-- Module: Notifications — 002 payload enrichment (post/comment preview)
-- =============================================================================
-- Rewrite della function `notifications_fanout_from_outbox` per arricchire
-- il payload INSERTato in `notifications` con:
--   - post_preview    → primi 100 char del body del post target
--                       (newlines collassati a singolo spazio)
--   - comment_preview → idem per i commenti, sui tipi comment.*
--
-- Il client UI usa questi campi per mostrare una line-clamped preview sotto
-- al summary i18n — senza dover fare un fetch extra del post hydratato.
-- Mantiene jsonb schema (no migration su `notifications` columns).
--
-- Vecchie notifiche pre-002 non hanno questi campi → la UI cade su fallback
-- (render senza preview): degraded ma non rotto.
--
-- Idempotente (CREATE OR REPLACE FUNCTION). Da incollare nel SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION notifications_fanout_from_outbox()
RETURNS trigger AS $$
DECLARE
  v_recipient_id    uuid;
  v_actor_id        uuid;
  v_post_id         uuid;
  v_comment_id      uuid;
  v_dedup_minutes   int;
  v_post_preview    text;
  v_comment_preview text;
  v_enriched        jsonb;
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

    ELSE
      UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
      RETURN NEW;
  END CASE;

  IF v_recipient_id IS NULL OR v_recipient_id = v_actor_id THEN
    UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Dedup check (invariato).
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

  -- ── Payload enrichment (NEW in 002) ────────────────────────────────────
  -- Estrai preview leggibili dal post / commento target così la UI può
  -- mostrare contesto sotto al summary senza fetch extra. Newlines
  -- collassati a spazio singolo per render mono-riga + line-clamped.

  IF v_post_id IS NOT NULL THEN
    SELECT LEFT(regexp_replace(body, '\s+', ' ', 'g'), 100)
    INTO v_post_preview
    FROM posts
    WHERE id = v_post_id AND deleted_at IS NULL;
  END IF;

  IF v_comment_id IS NOT NULL THEN
    SELECT LEFT(regexp_replace(body, '\s+', ' ', 'g'), 100)
    INTO v_comment_preview
    FROM posts_comments
    WHERE id = v_comment_id AND deleted_at IS NULL;
  END IF;

  -- Merge: payload originale (reaction, ecc.) + preview fields.
  -- jsonb_build_object skippa i NULL automaticamente con strip_nulls.
  v_enriched := NEW.payload
    || jsonb_strip_nulls(jsonb_build_object(
         'post_preview',    v_post_preview,
         'comment_preview', v_comment_preview
       ));

  INSERT INTO notifications (user_id, type, actor_id, post_id, comment_id, payload)
  VALUES (v_recipient_id, NEW.event_type, v_actor_id, v_post_id, v_comment_id, v_enriched);

  UPDATE posts_outbox SET processed_at = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger registration invariata da M_notifications_001 — la CREATE OR
-- REPLACE FUNCTION sostituisce il body senza toccare la trigger binding.
