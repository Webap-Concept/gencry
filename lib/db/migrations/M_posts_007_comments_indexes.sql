-- M_posts_007_comments_indexes.sql
--
-- Modulo Comments (PR-comments, 2026-05-17). Due cose:
--
--   1) Indici parziali per il fan-out alto (feed inline expand × N
--      PostCard espanse + post page + admin moderation queue).
--
--   2) Trigger DB che emette eventi BROADCAST su Supabase Realtime per
--      ogni nuovo commento. Pattern raccomandato dalla nuova UI Realtime
--      Supabase (Realtime → Channels) vs il legacy Postgres Changes:
--        - Più scalabile (no overhead WAL per ogni evento)
--        - Free tier più generoso (~2M msg/mese vs limite WAL)
--        - Channel multiplexable (V2 può aggregare insert+update+delete
--          sullo stesso topic con event differenti)
--      Payload curato: solo i campi necessari al banner client (IDs +
--      timestamp). Body NON inviato → niente leak di contenuto se la
--      policy RLS dovesse essere troppo permissiva.
--
--      Channel pubblico (4° arg di realtime.send = false, parametro
--      `private`). Default Supabase è TRUE (private) → l'omissione del
--      4° arg = channel privato, che richiede setAuth() + private:true
--      lato client. Per i commenti di post pubblici (default v1) +
--      futuro PR-9 SEO (commenti visibili anche anon) vogliamo channel
--      pubblico → passiamo `false` esplicito. Per futuri commenti su
--      post private/followers passeremo true + setAuth client + policy
--      RLS sul topic gating via realtime.topic().
--
-- Counter `posts.comments_count` è gestito dal trigger
-- `posts_comments_counter_trg` (M_posts_002_triggers.sql) che è già
-- soft-delete aware (transizioni NULL ↔ NOT NULL su deleted_at) — niente
-- patch del trigger necessaria.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.

BEGIN;

-- =============================================================================
-- 1) Indici parziali
-- =============================================================================

-- ── Root commenti per post (post page + feed inline expand) ───────────────
CREATE INDEX IF NOT EXISTS "idx_posts_comments_root"
  ON "posts_comments" ("post_id", "created_at")
  WHERE "parent_comment_id" IS NULL AND "deleted_at" IS NULL;

-- ── Reply per parent (window function + on-demand "mostra altre N") ───────
CREATE INDEX IF NOT EXISTS "idx_posts_comments_replies"
  ON "posts_comments" ("parent_comment_id", "created_at")
  WHERE "parent_comment_id" IS NOT NULL AND "deleted_at" IS NULL;

-- =============================================================================
-- 2) Realtime Broadcast trigger
-- =============================================================================
--
-- `realtime.send(payload, event, topic, private)` è l'helper Supabase
-- Realtime 2.x che pubblica un broadcast sul topic. Il client si abbona
-- a `posts_comments:{post_id}` e riceve gli eventi `insert` con il
-- payload sotto.
--
-- `private => false`: channel pubblico (basta la policy SELECT minima
-- sotto). Per i futuri commenti su post `private/followers` setteremo
-- `private => true` + policy che gate sull'autorizzazione del viewer.

CREATE OR REPLACE FUNCTION posts_comments_broadcast_trg() RETURNS trigger AS $$
DECLARE
  v_visibility text;
  v_is_private boolean;
BEGIN
  -- Skippa l'evento se il commento nasce già soft-deleted (caso patologico
  -- da seed/migration). Niente broadcast su edit/soft-delete v1 — il
  -- banner serve solo per "nuovi commenti", refresh manuale fa il resto.
  IF NEW.deleted_at IS NULL THEN
    -- Channel mode = visibility del post (vedi sezione "Realtime authz"
    -- nella architecture page del modulo). 1 SELECT extra ma O(1) su PK.
    SELECT visibility INTO v_visibility FROM posts WHERE id = NEW.post_id;
    v_is_private := COALESCE(v_visibility, 'public') <> 'public';

    PERFORM realtime.send(
      jsonb_build_object(
        'commentId',       NEW.id,
        'postId',          NEW.post_id,
        'parentCommentId', NEW.parent_comment_id,
        'authorId',        NEW.author_id,
        'createdAt',       NEW.created_at
      ),
      'insert',
      'posts_comments:' || NEW.post_id::text,
      v_is_private  -- 4° arg `private`: false per public post, true altrimenti.
                    -- Channel private richiede setAuth + RLS policy gate.
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_comments_broadcast_ai ON posts_comments;
CREATE TRIGGER posts_comments_broadcast_ai
  AFTER INSERT ON posts_comments
  FOR EACH ROW EXECUTE FUNCTION posts_comments_broadcast_trg();

-- =============================================================================
-- 3) RLS policy su realtime.messages (gate per channel PRIVATE)
-- =============================================================================
--
-- I channel public (post visibility = 'public') NON passano dalla RLS:
-- Supabase li distribuisce direttamente a chiunque. La policy sotto
-- gate i channel PRIVATE (members/followers/private) verificando che
-- il viewer abbia accesso al post target.
--
-- Topic format: `posts_comments:{post_uuid}` → estraggo post_uuid via
-- split_part. Visibility gate:
--   - members:   ok per qualsiasi authenticated (auth.jwt sub non-null)
--   - followers: solo se viewer è follower dell'autore (TODO modulo
--                follows: per ora gate "viewer = autore" come safe-fallback)
--   - private:   solo autore
--
-- `realtime.topic()` ritorna il topic della subscription corrente.
-- `auth.jwt()` ritorna il JWT custom firmato server-side (vedi
-- generateRealtimeAuthToken).

-- Drop prima per re-create idempotente (CREATE POLICY non ha IF NOT EXISTS)
DROP POLICY IF EXISTS "comments_topic_read"  ON realtime.messages;

CREATE POLICY "comments_topic_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'posts_comments:%'
    AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id::text = split_part(realtime.topic(), ':', 2)
        AND p.deleted_at IS NULL
        AND (
             p.visibility = 'public'
          OR p.visibility = 'members'
          OR (p.visibility = 'followers' AND p.author_id::text = (auth.jwt() ->> 'sub'))
          OR (p.visibility = 'private'   AND p.author_id::text = (auth.jwt() ->> 'sub'))
        )
    )
  );

COMMIT;
