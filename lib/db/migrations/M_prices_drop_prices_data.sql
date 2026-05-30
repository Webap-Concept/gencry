-- M_prices_drop_prices_data.sql
--
-- Rimuove la tabella prices_data, ora sostituita interamente dal
-- Redis hot cache (prices:hot:v1). I prezzi live vengono scritti
-- solo su Upstash dal cron sync; il DB non è più coinvolto nel
-- hot path dei prezzi correnti.
--
-- prices_history resta: serve per la perf30d delle watchlist e i
-- grafici storici 1d/1w/1m/1y.
--
-- Da incollare nel Supabase SQL Editor.

DROP TABLE IF EXISTS prices_data;
