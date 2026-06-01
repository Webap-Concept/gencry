-- M_rewards_004.sql
--
-- Aggiunge le milestone di streak giornaliere: 7, 14, 30 giorni consecutivi.
-- Configurabili in amount dall'admin, non in days (i giorni sono fissi).
-- Da incollare nel Supabase SQL Editor dopo M_rewards_003.

INSERT INTO rewards_rules(event_type, amount, daily_cap, enabled) VALUES
  ('streak_7',  50,  NULL, true),   -- 7 giorni di fila  → 50 GCC
  ('streak_14', 120, NULL, true),   -- 14 giorni di fila → 120 GCC
  ('streak_30', 300, NULL, true)    -- 30 giorni di fila → 300 GCC
ON CONFLICT (event_type) DO NOTHING;
