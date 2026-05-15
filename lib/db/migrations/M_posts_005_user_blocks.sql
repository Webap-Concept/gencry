-- M_posts_005_user_blocks.sql
--
-- Tabella `posts_user_blocks` — relazione di blocco mutuale tra utenti.
--
-- Semantica: se A blocca B, NESSUNO dei due vede contenuti dell'altro
-- (feed, profilo, singolo post, commenti). Mutual block: per l'enforcement
-- nelle query basta UNA riga (blocker_id=A, blocked_id=B); il filtro
-- nel feed fa OR su entrambe le direzioni (vedi queries.ts).
--
-- Index strategy:
--   - PK su (blocker_id, blocked_id) → lookup "cosa ho bloccato io"
--     (lista /settings/blocks futura)
--   - Secondario su (blocked_id, blocker_id) → lookup "chi mi ha bloccato"
--     usato dal feed nella direzione inversa
--
-- Cleanup: CASCADE su users → quando un account viene cancellato,
-- spariscono tutte le sue righe (sia come blocker sia come blocked).

BEGIN;

CREATE TABLE IF NOT EXISTS "posts_user_blocks" (
  "blocker_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("blocker_id", "blocked_id"),
  CONSTRAINT "posts_user_blocks_no_self_chk"
    CHECK ("blocker_id" <> "blocked_id")
);

-- Index inverso per lookup "chi ha bloccato me" (usato dal filtro feed
-- nella direzione inversa). Il PK già copre (blocker_id, blocked_id).
CREATE INDEX IF NOT EXISTS "idx_posts_user_blocks_blocked"
  ON "posts_user_blocks" ("blocked_id", "blocker_id");

COMMIT;
