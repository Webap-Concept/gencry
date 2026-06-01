-- M_rewards_003.sql
--
-- Supporto frazioni di coin (es. 0.3 per azioni minori).
-- Converte amount da INTEGER a NUMERIC(10,2) nelle regole e nel ledger,
-- e balance/lifetime_earned da BIGINT a NUMERIC(15,2) nei saldi.
--
-- Sicuro: NUMERIC è un superset di INTEGER, nessuna perdita di dati.
-- Da incollare nel Supabase SQL Editor dopo M_rewards_002.

ALTER TABLE rewards_rules
  ALTER COLUMN amount TYPE numeric(10,2) USING amount::numeric(10,2);

ALTER TABLE rewards_ledger
  ALTER COLUMN amount TYPE numeric(10,2) USING amount::numeric(10,2);

ALTER TABLE rewards_balances
  ALTER COLUMN balance         TYPE numeric(15,2) USING balance::numeric(15,2),
  ALTER COLUMN lifetime_earned TYPE numeric(15,2) USING lifetime_earned::numeric(15,2);
