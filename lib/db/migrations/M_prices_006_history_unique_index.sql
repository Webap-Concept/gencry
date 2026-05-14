-- =============================================================================
-- Module: Prices Engine — 006 prices_history (symbol, ts) UNIQUE
-- =============================================================================
-- Premessa: il backfill da CryptoCompare (vedi sources/cryptocompare.ts)
-- usa `ON CONFLICT (symbol, ts) DO UPDATE WHERE prices_history.price = trunc(...)`
-- per essere idempotente e per rimpiazzare i punti vecchi "arrotondati"
-- (eredità del path precedente che copiava prices_data settled con delta
-- threshold attivo, ora rimosso). Quel ON CONFLICT richiede un vincolo
-- UNIQUE su (symbol, ts).
--
-- Step:
--   1. Dedupe preventivo. Possono esserci righe duplicate (symbol, ts)
--      dal periodo in cui sync + snapshot scrivevano entrambi: teniamo
--      la riga con `id` MAX (la più recente in scrittura) e cancelliamo
--      le altre.
--   2. Crea UNIQUE INDEX (idempotente con IF NOT EXISTS).
--
-- Da incollare nel Supabase SQL Editor. Sicuro su DB vivo: il DELETE
-- usa un range lock per blocchi, l'INDEX CREATE è veloce.
-- =============================================================================

-- 1) Dedupe
DELETE FROM "prices_history" a
USING  "prices_history" b
WHERE  a.id < b.id
  AND  a.symbol = b.symbol
  AND  a.ts     = b.ts;

-- 2) Unique index
CREATE UNIQUE INDEX IF NOT EXISTS "prices_history_symbol_ts_uniq"
  ON "prices_history" (symbol, ts);
