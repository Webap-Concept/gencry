-- =============================================================================
-- Module: Prices Engine — 004 weekly sparkline pre-aggregata
-- =============================================================================
-- Aggiunge due colonne a `prices_data` per servire la sparkline settimanale
-- alle card coin del frontend in 1 sola query (no fan-out su `prices_history`
-- ad ogni render).
--
--   weekly_sparkline    JSONB   array di 7 numeri (oldest → newest, oggi
--                                incluso). NULL finché il primo refresh non
--                                ha girato. Decorativa, non trading-grade.
--   weekly_sparkline_at TIMESTAMPTZ  ultimo ricalcolo. Il sync skippa il
--                                ricalcolo se è recente (< 24h).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Da incollare nel Supabase SQL Editor.
-- =============================================================================

ALTER TABLE "prices_data"
  ADD COLUMN IF NOT EXISTS "weekly_sparkline"    JSONB,
  ADD COLUMN IF NOT EXISTS "weekly_sparkline_at" TIMESTAMPTZ;
