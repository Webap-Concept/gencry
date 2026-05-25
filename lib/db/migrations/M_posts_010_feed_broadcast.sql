-- M_posts_010_feed_broadcast.sql
--
-- Trigger DB plpgsql che emette Supabase Realtime Broadcast su topic
-- `feed:discover` ad ogni INSERT su `posts` con visibility ∈ (public,
-- members) e non soft-deleted. Replica simmetrica del pattern dei
-- commenti (M_posts_007 `posts_comments_broadcast_trg`).
--
-- Perché Broadcast e non Postgres Changes:
--   - Niente bisogno di aggiungere `posts` alla publication
--     `supabase_realtime`. Postgres Changes leakerebbe TUTTI gli INSERT
--     ai subscriber (incluso private/followers) finché RLS non venisse
--     abilitata su posts — e abilitare RLS su una tabella già usata
--     da Server Actions è un'operazione delicata.
--   - Broadcast offre filter "by design": il trigger sceglie cosa
--     emettere, niente leak possibile.
--   - Consistency col resto del modulo Posts: i commenti usano già
--     Broadcast, mantenere 1 solo pattern semplifica il mental model.
--
-- Topic: `feed:discover` (singolo topic globale). Il banner client
-- subscribed riceve gli eventi e li filtra JS-side per:
--   - author_id !== viewerUserId (skip self-post, già nel client)
--   - created_at > watermark client (defense in depth)
--
-- Filter visibility nel trigger:
--   - public: tutti i subscriber del topic ricevono → ok per anon
--     futuri se mai apriremo il discover (oggi /explore è protected).
--   - members: ricevuto da tutti i subscriber del topic. Decisione
--     accettabile: oggi /explore è protected → nessun anon subscribe.
--     Se in futuro apriremo, splittare in 2 topic (public/members).
--   - followers, private: NON emesso (niente leak ai feed-wide
--     subscriber, è la lo scopo principale del trigger filter).
--
-- private => false (4° arg di realtime.send): channel public, niente
-- policy RLS richiesta sui subscriber. La sicurezza è nel WHERE del
-- trigger, non nel canale.

BEGIN;

CREATE OR REPLACE FUNCTION posts_feed_broadcast_trg() RETURNS trigger AS $$
BEGIN
  -- Solo public/members + non deleted. private/followers NON vengono
  -- mai emessi → impossibile leakarli al banner globale.
  IF NEW.deleted_at IS NULL
     AND NEW.visibility IN ('public', 'members') THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'postId',      NEW.id,
        'authorId',    NEW.author_id,
        'visibility',  NEW.visibility,
        'createdAt',   NEW.created_at
      ),
      'insert',
      'feed:discover',
      false  -- public channel, no JWT/RLS gate richiesto
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_feed_broadcast_ai ON posts;
CREATE TRIGGER posts_feed_broadcast_ai
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_feed_broadcast_trg();

COMMIT;
