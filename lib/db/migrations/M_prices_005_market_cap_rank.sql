-- =============================================================================
-- Module: Prices Engine — 005 market_cap_rank su prices_coins
-- =============================================================================
-- Aggiunge il rank globale per market cap (campo già fornito da CoinGecko
-- /coins/markets nel campo `market_cap_rank`). Lo usiamo nelle card coin del
-- frontend per la chip `#1`, `#2`, ecc., così la posizione mostrata è la
-- vera classifica globale e NON l'indice della lista locale (che potrebbe
-- essere filtrata per categoria, search, ecc.).
--
-- Aggiornato dal sync cron ogni 5 min insieme al prezzo. Cambia raramente
-- (top 50 sono stabili a livello giornaliero) ma allineato comunque.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Da incollare nel Supabase SQL Editor.
-- =============================================================================

ALTER TABLE "prices_coins"
  ADD COLUMN IF NOT EXISTS "market_cap_rank" INTEGER;
