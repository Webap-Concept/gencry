-- M_social_graph_005_notify_dedup.sql
--
-- Dedup window per le notifiche `social.follow`. Senza, un
-- unfollow → refollow rapido (A clicca per sbaglio Smetti di seguire,
-- poi rimedia in pochi secondi) genera 2 notifiche distinte a B.
--
-- Pattern: stesso shape del check fatto da
-- `notifications_fanout_from_outbox` (M_notifications_001) per i tipi
-- post.*. Reuse della setting esistente
-- `modules.notifications.dedup_window_minutes` (default 60) per non
-- proliferare configurazione.
--
-- Idempotente. CREATE OR REPLACE sostituisce la function gia' creata da
-- M_social_graph_002.

BEGIN;

CREATE OR REPLACE FUNCTION social_graph_notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_username text;
  v_dedup_minutes  int;
BEGIN
  -- Settings lookup: COALESCE a 60 se la chiave manca o non e' int.
  SELECT NULLIF(value, '')::int INTO v_dedup_minutes
  FROM app_settings
  WHERE key = 'modules.notifications.dedup_window_minutes';
  v_dedup_minutes := COALESCE(v_dedup_minutes, 60);

  -- Dedup check: gia' notifica social.follow recente per la stessa
  -- coppia (recipient=followed, actor=follower)? Skip.
  PERFORM 1 FROM notifications
   WHERE user_id    = NEW.followed_id
     AND type       = 'social.follow'
     AND actor_id   = NEW.follower_id
     AND created_at > NOW() - (v_dedup_minutes || ' minutes')::interval
   LIMIT 1;
  IF FOUND THEN
    RETURN NEW;
  END IF;

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

-- Trigger gia' montato da M_social_graph_002, la sostituzione della
-- function basta (DROP/CREATE non necessario).

COMMIT;
