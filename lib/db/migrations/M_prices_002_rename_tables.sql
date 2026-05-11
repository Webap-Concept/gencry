-- =============================================================================
-- Module: Prices Engine — 002 rename tables to <slug>_<sub> convention
-- =============================================================================
-- Allinea i nomi tabella del modulo `prices` alla convenzione modulare
-- (vedi memory: project_modular_architecture.md → "Naming tabelle"):
--
--   coins        → prices_coins
--   prices       → prices_data
--   coin_prices  → prices_history
--
-- Le altre tabelle del modulo (`prices_source_health`, `prices_sync_runs`)
-- erano già conformi e non vengono toccate.
--
-- Postgres NON rinomina automaticamente PK/FK/index/sequence quando si rinomina
-- una tabella — vanno rinominati esplicitamente per non lasciare nomi vecchi
-- in giro che diventerebbero un mistero alla prossima ispezione di pg_class.
--
-- Idempotente: ogni rename è dentro un DO block che controlla l'esistenza
-- della sorgente E l'assenza della destinazione, quindi può essere ri-eseguita
-- senza errori anche se metà è già stata applicata.
--
-- Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Tabella: coins → prices_coins ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'coins' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prices_coins' AND relkind = 'r') THEN
    ALTER TABLE "coins" RENAME TO "prices_coins";
  END IF;
END $$;

-- PK auto-named: coins_pkey → prices_coins_pkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coins_pkey') THEN
    ALTER TABLE "prices_coins" RENAME CONSTRAINT "coins_pkey" TO "prices_coins_pkey";
  END IF;
END $$;

-- UNIQUE auto-named: coins_coingecko_id_key → prices_coins_coingecko_id_key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coins_coingecko_id_key') THEN
    ALTER TABLE "prices_coins" RENAME CONSTRAINT "coins_coingecko_id_key" TO "prices_coins_coingecko_id_key";
  END IF;
END $$;

-- Index: idx_coins_active_mcap → idx_prices_coins_active_mcap
ALTER INDEX IF EXISTS "idx_coins_active_mcap" RENAME TO "idx_prices_coins_active_mcap";

-- ── 2) Tabella: prices → prices_data ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prices' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prices_data' AND relkind = 'r') THEN
    ALTER TABLE "prices" RENAME TO "prices_data";
  END IF;
END $$;

-- PK auto-named: prices_pkey → prices_data_pkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prices_pkey') THEN
    ALTER TABLE "prices_data" RENAME CONSTRAINT "prices_pkey" TO "prices_data_pkey";
  END IF;
END $$;

-- FK auto-named: prices_symbol_fkey → prices_data_symbol_fkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prices_symbol_fkey') THEN
    ALTER TABLE "prices_data" RENAME CONSTRAINT "prices_symbol_fkey" TO "prices_data_symbol_fkey";
  END IF;
END $$;

-- ── 3) Tabella: coin_prices → prices_history ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'coin_prices' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prices_history' AND relkind = 'r') THEN
    ALTER TABLE "coin_prices" RENAME TO "prices_history";
  END IF;
END $$;

-- PK auto-named: coin_prices_pkey → prices_history_pkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coin_prices_pkey') THEN
    ALTER TABLE "prices_history" RENAME CONSTRAINT "coin_prices_pkey" TO "prices_history_pkey";
  END IF;
END $$;

-- FK auto-named: coin_prices_symbol_fkey → prices_history_symbol_fkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coin_prices_symbol_fkey') THEN
    ALTER TABLE "prices_history" RENAME CONSTRAINT "coin_prices_symbol_fkey" TO "prices_history_symbol_fkey";
  END IF;
END $$;

-- Sequence del bigserial: coin_prices_id_seq → prices_history_id_seq
ALTER SEQUENCE IF EXISTS "coin_prices_id_seq" RENAME TO "prices_history_id_seq";

-- Index: idx_coin_prices_symbol_ts → idx_prices_history_symbol_ts
ALTER INDEX IF EXISTS "idx_coin_prices_symbol_ts" RENAME TO "idx_prices_history_symbol_ts";
