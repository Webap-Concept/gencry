-- =============================================================================
-- Module: News — 004 propose-first workflow
-- =============================================================================
-- Introduce uno stato 'proposed' iniziale: lo scraper salva solo titolo +
-- link + excerpt RSS, senza fetch del body né chiamata LLM. L'admin clicca
-- "Approve" → status='pending_rewrite' → rewriter cron processa.
--
-- Motivo: paghi rewrite Claude solo sugli articoli che vuoi davvero
-- pubblicare. Risparmio ~90% sui costi LLM rispetto al flow "rewrite-all".
--
-- Auto-reject: gli items in 'proposed' più vecchi di
-- modules.news.proposed_retention_days (default 7) vengono spostati a
-- 'rejected' dal cron `cleanup-proposed` (daily).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Drop + ricrea CHECK constraint con il nuovo valore ─────────────────
ALTER TABLE "news_items" DROP CONSTRAINT IF EXISTS "news_items_status_chk";

ALTER TABLE "news_items"
  ADD CONSTRAINT "news_items_status_chk"
  CHECK ("status" IN (
    'proposed', 'pending_rewrite', 'review', 'scheduled', 'published', 'rejected', 'failed'
  ));

-- ── 2) Indice partial per pickup admin "Proposte" ─────────────────────────
-- Listing della tab Proposed: ordina per created_at DESC, filtra status.
-- Partial index → piccolissimo, hot path per la queue admin.
CREATE INDEX IF NOT EXISTS "idx_news_items_proposed"
  ON "news_items" ("created_at" DESC)
  WHERE "status" = 'proposed';
