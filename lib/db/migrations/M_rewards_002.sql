-- M_rewards_002.sql
--
-- Aggiunge l'evento 'comment_created' alle rewards_rules.
-- Amount default: 3 coins per commento, daily_cap 5 (max 15 coin/giorno da commenti).
-- Da incollare nel Supabase SQL Editor dopo M_rewards_001.

INSERT INTO rewards_rules(event_type, amount, daily_cap, enabled) VALUES
  ('comment_created', 3, 5, true)
ON CONFLICT (event_type) DO NOTHING;
