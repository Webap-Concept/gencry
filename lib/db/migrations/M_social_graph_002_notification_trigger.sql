-- M_social_graph_002_notification_trigger.sql
--
-- Modulo social-graph (PR3): notifica "X ha iniziato a seguirti".
--
-- Trigger AFTER INSERT su `user_follows` che inserisce direttamente una
-- riga in `notifications` (kind 'social.follow'). Non passa per
-- `posts_outbox` perche' quella outbox e' modellata per eventi posts; il
-- modulo notifications gia' accetta inserzioni dirette per i tipi
-- moderation.* e achievement.* (vedi `notifications_fanout_from_outbox`
-- — solo i tipi `post.*` passano dall'outbox).
--
-- Payload: includiamo `actor_username` per evitare un JOIN su user_profiles
-- al render della notifica (e per il deep-link a /u/<username>). Se lo
-- username e' NULL (utenti senza profilo username) il render della UI cade
-- su href '#' con label generica.
--
-- Dedup: nessuno in V1. Se A → unfollow → refollow nello stesso giorno
-- vede due notifiche. Acceptable per V1 — se diventa rumoroso si aggiunge
-- una finestra di dedup (es. 24h) come per le notifications post.*.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION social_graph_notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_username text;
BEGIN
  -- Lookup username dell'attore (follower) per il deep-link.
  SELECT username INTO v_actor_username
  FROM user_profiles
  WHERE user_id = NEW.follower_id
  LIMIT 1;

  INSERT INTO notifications (user_id, type, actor_id, payload)
  VALUES (
    NEW.followed_id,
    'social.follow',
    NEW.follower_id,
    jsonb_build_object('actor_username', v_actor_username)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_follows_notify_trg ON user_follows;
CREATE TRIGGER user_follows_notify_trg
AFTER INSERT ON user_follows
FOR EACH ROW EXECUTE FUNCTION social_graph_notify_new_follower();

COMMIT;
