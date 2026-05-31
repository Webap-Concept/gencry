-- M_prices_sparkline_to_coins.sql
--
-- Sposta weekly_sparkline da prices_data (droppata) a prices_coins, dove
-- vivono già market_cap/market_cap_rank. La sparkline è master data
-- semi-statico (decorativa, 7gg downsampled, aggiornata ogni 4h dal cron
-- metadata-refresh), non un dato hot → appartiene a prices_coins, non a
-- Redis né a prices_data.
--
-- Da incollare nel Supabase SQL Editor.

ALTER TABLE "prices_coins"
  ADD COLUMN IF NOT EXISTS "weekly_sparkline"    jsonb,
  ADD COLUMN IF NOT EXISTS "weekly_sparkline_at" timestamptz;

-- Copia best-effort dei dati esistenti se prices_data è ancora presente
-- (così non si perde la sparkline corrente in attesa del prossimo cron).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'prices_data'
  ) THEN
    UPDATE "prices_coins" c
    SET weekly_sparkline    = d.weekly_sparkline,
        weekly_sparkline_at = d.weekly_sparkline_at
    FROM "prices_data" d
    WHERE d.symbol = c.symbol
      AND d.weekly_sparkline IS NOT NULL;
  END IF;
END $$;
