-- =============================================================================
-- Module: Notifications — 003 preview ellipsis on truncation
-- =============================================================================
-- Aggiusto il trigger di fanout (M_notifications_002) così quando il body
-- del post/commento supera la soglia di preview (100 char), il troncamento
-- aggiunge un '…' finale invece di tagliare bruscamente. Senza il marker
-- l'utente non sa che il body continua oltre.
--
-- Soglia invariata (100 char). Niente smart-break su parola: la
-- complicazione regex non vale il piccolo guadagno percepibile.
--
-- Idempotente (CREATE OR REPLACE FUNCTION). Sostituisce il body della
-- function senza toccare la trigger binding.
-- =============================================================================

CREATE OR REPLACE FUNCTION notifications_fanout_from_outbox()
RETURNS trigger AS $$
DECLARE
  v_recipient_id    uuid;
  v_actor_id        uuid;
  v_post_id         uuid;
  v_comment_id      uuid;
  v_dedup_minutes   int;
  v_post_body       text;
  v_comment_body    text;
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

  -- ── Payload enrichment con ellipsis on truncation (NEW in 003) ─────────
  -- Estraggo il body PULITO (whitespace collassato) → se supera 100 char
  -- tronco a 99 + '…', altrimenti lo lascio intero. Niente smart-break
  -- su parola (complicazione regex non vale il guadagno).

  IF v_post_id IS NOT NULL THEN
    SELECT regexp_replace(body, '\s+', ' ', 'g')
    INTO v_post_body
    FROM posts
    WHERE id = v_post_id AND deleted_at IS NULL;

    IF v_post_body IS NOT NULL THEN
      v_post_preview := CASE
        WHEN LENGTH(v_post_body) > 100 THEN LEFT(v_post_body, 99) || '…'
        ELSE v_post_body
      END;
    END IF;
  END IF;

  IF v_comment_id IS NOT NULL THEN
    SELECT regexp_replace(body, '\s+', ' ', 'g')
    INTO v_comment_body
    FROM posts_comments
    WHERE id = v_comment_id AND deleted_at IS NULL;

    IF v_comment_body IS NOT NULL THEN
      v_comment_preview := CASE
        WHEN LENGTH(v_comment_body) > 100 THEN LEFT(v_comment_body, 99) || '…'
        ELSE v_comment_body
      END;
    END IF;
  END IF;

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
