-- M_watchlist_002_featured.sql
--
-- Feature "appare nel mio feed": flag su watchlists. Max UNA watchlist
-- featured per utente, garantito da partial unique index.
--
-- L'app gestisce il toggle in modo esclusivo (azzera le altre prima di
-- attivarne una) in transazione; l'index è il backstop a livello DB che
-- impedisce stati inconsistenti anche da accessi concorrenti.
--
-- CREATE INDEX CONCURRENTLY non può girare in transazione → niente
-- BEGIN/COMMIT. Da incollare nel Supabase SQL Editor.

ALTER TABLE "watchlists"
  ADD COLUMN IF NOT EXISTS "featured_in_feed" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "uq_watchlists_user_featured"
  ON "watchlists" ("user_id")
  WHERE "featured_in_feed" AND "archived_at" IS NULL;
