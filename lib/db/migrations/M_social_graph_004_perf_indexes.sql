-- M_social_graph_004_perf_indexes.sql
--
-- Index di performance identificati durante l'audit hot path del
-- modulo social-graph (2026-05-28). Non urgenti su scala alpha (<100
-- DAU), ma li aggiungiamo subito perche':
--
--   1. Posso crearli ONLINE senza lock (CONCURRENTLY) → zero downtime.
--   2. Quando entreranno in regime, il costo di crearli su DB pieno
--      sara' alto e dovremo farlo "di corsa" sotto pressione.
--
-- ───────────────────────────────────────────────────────────────────────
-- Index 1: posts(author_id, created_at DESC, id DESC)
-- ───────────────────────────────────────────────────────────────────────
-- Scenario: feed Home following-first. La query e':
--
--   SELECT id, created_at FROM posts
--    WHERE author_id IN (<followingSet>)
--      AND visibility IN ('public','members','followers')
--      AND deleted_at IS NULL
--      AND (created_at, id) < (cursor_ts, cursor_id)
--    ORDER BY created_at DESC, id DESC
--    LIMIT pageSize + 1;
--
-- Senza index su author_id, il planner sceglie:
--   - bitmap scan su posts_created_at_idx → richiede heap scan + sort
--     in memoria quando followingSet > qualche decina di id
--   - oppure seq scan su posts se l'IN list e' molto grande
--
-- Con l'index composito (author_id, created_at DESC, id DESC):
--   - access path = index scan PER OGNI author_id in parallelo →
--     bitmap-or → merge ordinato. Cap di 50ms anche con 1k followee
--     e milioni di post.
--
-- Trade-off: l'index pesa ~30-50MB per ogni 1M post (1 entry per riga).
-- Il guadagno scala con l'engagement → vale la pena dal day-1.
--
-- INCLUDE id non necessario: la PK e' gia' visibile per index-only scan.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_author_created_id"
  ON "posts" ("author_id", "created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL;

-- ───────────────────────────────────────────────────────────────────────
-- Index 2: user_social_counters(followers_count DESC) WHERE followers_count > 0
-- ───────────────────────────────────────────────────────────────────────
-- Scenario: SuggestedFollowsRow mostra i top utenti per followers_count
-- quando il viewer non segue ancora nessuno. Query:
--
--   SELECT c.user_id, p.username, ...
--     FROM user_social_counters c
--     LEFT JOIN user_profiles p ON p.user_id = c.user_id
--    WHERE c.user_id <> $viewer
--      AND c.followers_count > 0
--      AND NOT EXISTS (subquery user_follows)
--      AND NOT EXISTS (subquery posts_user_blocks)
--    ORDER BY c.followers_count DESC
--    LIMIT 8;
--
-- Senza index dedicato il planner fa Seq Scan + Sort sui tutti i row di
-- user_social_counters. A 100 utenti = OK, a 100k utenti = ~200ms.
--
-- Index PARZIALE su followers_count > 0:
--   - Esclude tutti gli utenti senza follower (la maggioranza nei primi
--     mesi). L'index e' minuscolo (kB invece di MB) e copre esattamente
--     i candidati della query.
--   - Order by DESC nell'index → planner usa Index Scan + Limit, niente
--     sort esterno.
--
-- WHERE user_id IS NOT NULL implicito (PK NOT NULL).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_social_counters_top_followers"
  ON "user_social_counters" ("followers_count" DESC)
  WHERE "followers_count" > 0;

-- ───────────────────────────────────────────────────────────────────────
-- Operations note: CREATE INDEX CONCURRENTLY non puo' girare dentro una
-- transazione → questo file NON ha BEGIN/COMMIT. Da incollare nel
-- Supabase SQL Editor riga per riga (o in 2 query separate).
-- ───────────────────────────────────────────────────────────────────────
