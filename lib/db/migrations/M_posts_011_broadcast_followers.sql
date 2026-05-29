-- M_posts_011_broadcast_followers.sql
--
-- Aggiornamento del trigger Realtime Broadcast `posts_feed_broadcast_trg`
-- (vedi M_posts_010_feed_broadcast.sql) per emettere anche i post con
-- visibility = 'followers'. Necessario per il banner "X nuovi post" del
-- feed Home (modulo social-graph PR3): l'utente loggato deve ricevere
-- l'evento per i post 'followers' degli autori che segue.
--
-- Topic invariato: `feed:discover` (single global topic). Sicurezza:
--   - Il client del banner Home filtra JS-side su `authorId in
--     followingSet(viewer)` → solo i post 'followers' di autori seguiti
--     incrementano il counter. Per i non-followee il payload passa
--     dal trigger ma viene scartato dal client (overhead trascurabile).
--   - Lato server non c'e' leak: il payload contiene solo authorId +
--     postId + visibility. Niente body, niente preview. Per leggere il
--     post il client deve poi passare per getPostsByIds (visibility
--     gate applicato lato DB con followingSet).
--
-- Il banner di /explore (legacy `NewPostsBannerSlot`) continua a girare
-- sullo stesso topic e adesso vede anche eventi 'followers'. Per quel
-- canale e' tollerato: 'followers' eventi NON visibili in /explore
-- vengono ignorati dal client perche' la pagina mostra solo Discover —
-- al massimo l'utente vede una conta leggermente inflata se segue
-- qualcuno che pubblica 'followers'. Caveat accettato in V1.
--
-- private NON viene emesso (l'unica visibility cosi' privata che gate
-- esclusivamente su viewer == author).

BEGIN;

CREATE OR REPLACE FUNCTION posts_feed_broadcast_trg() RETURNS trigger AS $$
BEGIN
  IF NEW.deleted_at IS NULL
     AND NEW.visibility IN ('public', 'members', 'followers') THEN
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

-- Il trigger gia' esiste da M_posts_010, non lo ricreiamo.
-- CREATE OR REPLACE FUNCTION sopra basta per aggiornare il body.

COMMIT;
