-- M_rewards_006.sql
--
-- Fix 1 (BUG che rompe i like) — type mismatch nel trigger.
--   Il trigger rewards_on_reaction_insert (M_rewards_001) dichiarava
--     v_amount integer
--   ma M_rewards_003 ha convertito rewards_rules.amount a numeric(10,2) per
--   supportare le frazioni di coin. Conseguenza: un amount frazionario
--   (es. 0.30) veniva ARROTONDATO a 0 nell'assegnazione `INTO v_amount`,
--   poi l'INSERT con amount=0 violava il CHECK rewards_ledger_amount_pos
--   (amount > 0) → OGNI like falliva con 23514. Anche amount come 0.70 veniva
--   silenziosamente corrotto a 1.
--   Fix: v_amount numeric(10,2) + skip esplicito se amount <= 0.
--
-- Fix 2 (BUG latente sullo spending) — constraint troppo restrittivo.
--   rewards_ledger_amount_pos = CHECK (amount > 0) blocca le redemption, che
--   inseriscono amount NEGATIVI (spesa GCC, vedi redeem.ts). Al primo acquisto
--   sarebbe fallito con lo stesso 23514. Rilassato a (amount <> 0): consente
--   accrediti (>0) e spese (<0), vieta solo righe a zero (prive di senso).
--
-- Da incollare nel Supabase SQL Editor dopo M_rewards_005.

-- ─── Fix 2: constraint ledger amount (positivo → non-zero) ───────────────────
ALTER TABLE rewards_ledger DROP CONSTRAINT IF EXISTS rewards_ledger_amount_pos;
ALTER TABLE rewards_ledger
  ADD CONSTRAINT rewards_ledger_amount_nonzero CHECK (amount <> 0);

-- ─── Fix 1: trigger reaction con amount numerico + guard ─────────────────────
CREATE OR REPLACE FUNCTION rewards_on_reaction_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_author_id uuid;
  v_amount    numeric(10,2);   -- era integer: troncava/arrotondava le frazioni
  v_daily_cap integer;
  v_enabled   boolean;
  v_count     bigint;
BEGIN
  -- Recupera autore del post
  SELECT author_id INTO v_author_id FROM posts WHERE id = NEW.post_id;
  IF v_author_id IS NULL THEN RETURN NEW; END IF;

  -- Nessun auto-reward
  IF v_author_id = NEW.user_id THEN RETURN NEW; END IF;

  -- Leggi la regola
  SELECT amount, daily_cap, enabled
    INTO v_amount, v_daily_cap, v_enabled
    FROM rewards_rules WHERE event_type = 'like_received';
  -- Skip se regola assente, disabilitata, o amount non positivo
  -- (0 reward = nessun accredito, non un errore)
  IF NOT FOUND OR NOT v_enabled OR v_amount IS NULL OR v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Controlla il daily_cap per l'autore (quante like_received oggi?)
  IF v_daily_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM rewards_ledger
     WHERE user_id    = v_author_id
       AND event_type = 'like_received'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF v_count >= v_daily_cap THEN RETURN NEW; END IF;
  END IF;

  -- Inserisci con idempotency (ON CONFLICT DO NOTHING = safe se reaction già vista)
  INSERT INTO rewards_ledger(user_id, event_type, amount, idempotency_key, reference_id)
  VALUES (
    v_author_id,
    'like_received',
    v_amount,
    'like_received:' || NEW.post_id::text || ':' || NEW.user_id::text,
    NEW.post_id
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Il trigger rewards_reaction_insert_trg punta già a questa funzione:
-- CREATE OR REPLACE basta, non serve ricrearlo.
