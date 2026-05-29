-- M_social_graph_003_block_cascade.sql
--
-- Block → unfollow cascade. Quando A blocca B (INSERT in
-- `posts_user_blocks`), entrambe le righe `user_follows` (A→B e B→A)
-- vengono cancellate. Le DELETE attivano il trigger esistente
-- `user_follows_sync_counters_trg` (vedi M_social_graph_001) che
-- decrementa i counter following_count / followers_count di entrambi.
--
-- Razionale (decisione 2026-05-28):
--   - Senza cascade, A blocca B ma `user_follows(A,B)` resta in tabella.
--     I counter mostrano un follow che non esiste piu' di fatto, la
--     pagina /u/B/followers continua a elencare A, e l'eventuale
--     unblock lascia un "follow zombie" che A non ha mai disattivato
--     consapevolmente. Pattern X/IG/Threads: block azzera il rapporto.
--   - Trigger DB (vs cancellazione JS-side) e' "cintura+bretelle":
--     copre anche path che bypassano la server action (script admin,
--     SQL diretto, future API esterne, seed di test).
--   - Unblock NON ripristina il follow precedente: se A vuole tornare
--     a seguire B, click esplicito (no soft-archive del rapporto).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION posts_user_blocks_cascade_unfollow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- DELETE entrambe le direzioni in un'unica statement. Le DELETE
  -- triggerano user_follows_sync_counters_trg che aggiusta i counter
  -- in user_social_counters (clamp >= 0).
  DELETE FROM user_follows
   WHERE (follower_id = NEW.blocker_id AND followed_id = NEW.blocked_id)
      OR (follower_id = NEW.blocked_id AND followed_id = NEW.blocker_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_user_blocks_cascade_unfollow_trg ON posts_user_blocks;
CREATE TRIGGER posts_user_blocks_cascade_unfollow_trg
AFTER INSERT ON posts_user_blocks
FOR EACH ROW EXECUTE FUNCTION posts_user_blocks_cascade_unfollow();

COMMIT;
