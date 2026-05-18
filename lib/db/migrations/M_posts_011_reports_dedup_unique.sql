-- =============================================================================
-- Module: Posts — 011 dedup posts_reports + unique parziali (fix M_posts_010)
-- =============================================================================
-- M_posts_010 ha provato a creare 2 unique parziali per impedire che lo
-- stesso utente segnali due volte lo stesso target. Su DB con righe
-- duplicate pre-esistenti (seeder, test, segnalazioni ripetute pre-feature)
-- il CREATE UNIQUE INDEX fallisce con:
--   "Key (reporter_id, post_id)=(...) is duplicated."
--
-- Questo file fa 2 cose, in ordine:
--   1. Dedupla la tabella per i 2 raggruppamenti (reporter_id × post_id) e
--      (reporter_id × comment_id), tenendo la riga PIÙ VECCHIA per gruppo
--      (la prima segnalazione "vale", le successive sono noise).
--   2. Ricrea i 2 unique parziali in modo idempotente. Se erano stati
--      creati da una M_010 fortunata, l'IF NOT EXISTS li skippa.
--
-- Idempotente. Da incollare nel SQL Editor.
-- =============================================================================

-- ── 1) Dedup per (reporter_id, post_id) — tieni la prima per createdAt ────
-- CTE con ROW_NUMBER per gruppo: tutte le righe con rn>1 sono "extra" e
-- vanno droppate. ORDER BY created_at ASC, id ASC dà ordering deterministico
-- anche su due righe con stesso created_at (rarissimo, ma succede in seed).
WITH duplicati AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY reporter_id, post_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM posts_reports
  WHERE post_id IS NOT NULL
)
DELETE FROM posts_reports
WHERE id IN (SELECT id FROM duplicati WHERE rn > 1);

-- ── 2) Dedup per (reporter_id, comment_id) — speculare al sopra ────────────
-- Pre-M_010 il comment_id non esisteva; pratica zero, ma teniamo lo step
-- per future re-run idempotenti dopo che la feature comment-reports è viva.
WITH duplicati AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY reporter_id, comment_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM posts_reports
  WHERE comment_id IS NOT NULL
)
DELETE FROM posts_reports
WHERE id IN (SELECT id FROM duplicati WHERE rn > 1);

-- ── 3) Ricrea gli unique parziali (idempotenti via IF NOT EXISTS) ─────────
CREATE UNIQUE INDEX IF NOT EXISTS "uq_posts_reports_reporter_post"
  ON "posts_reports" ("reporter_id", "post_id")
  WHERE "post_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_posts_reports_reporter_comment"
  ON "posts_reports" ("reporter_id", "comment_id")
  WHERE "comment_id" IS NOT NULL;
