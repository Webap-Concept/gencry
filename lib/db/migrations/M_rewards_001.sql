-- M_rewards_001.sql
--
-- Modulo Rewards: virtual coin economy per la gamification utente.
-- Tre tabelle:
--   rewards_rules    — regole configurabili (amount + daily_cap per event_type)
--   rewards_ledger   — libro mastro append-only di ogni accredito
--   rewards_balances — saldo denormalizzato per lettura O(1)
--
-- Trigger DB:
--   rewards_ledger_balance_trg — aggiorna rewards_balances ad ogni INSERT su ledger
--   rewards_reaction_insert_trg — accredita like_received al post author su INSERT posts_reactions
--
-- Da incollare nel Supabase SQL Editor.

-- ─── rewards_rules ──────────────────────────────────────────────────────────
-- Una riga per event_type. L'admin configura amount e daily_cap via /admin/modules/rewards/settings.

CREATE TABLE IF NOT EXISTS "rewards_rules" (
  "event_type"  varchar(40)  PRIMARY KEY,
  "amount"      integer      NOT NULL DEFAULT 1
                             CONSTRAINT rewards_rules_amount_pos CHECK (amount > 0),
  "daily_cap"   integer      CONSTRAINT rewards_rules_cap_pos CHECK (daily_cap IS NULL OR daily_cap > 0),
  "enabled"     boolean      NOT NULL DEFAULT true,
  "created_at"  timestamptz  NOT NULL DEFAULT now(),
  "updated_at"  timestamptz  NOT NULL DEFAULT now()
);

-- ─── rewards_ledger ──────────────────────────────────────────────────────────
-- Append-only: mai UPDATE né DELETE su righe esistenti.
-- UNIQUE(user_id, idempotency_key) = guardia anti-abuse / doppio accredito.

CREATE TABLE IF NOT EXISTS "rewards_ledger" (
  "id"               uuid         PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"          uuid         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type"       varchar(40)  NOT NULL,
  "amount"           integer      NOT NULL CONSTRAINT rewards_ledger_amount_pos CHECK (amount > 0),
  -- Chiave idempotency, esempi:
  --   daily_checkin:2026-06-01
  --   post_created:550e8400-e29b-...
  --   like_received:550e8400...:a3f9...
  "idempotency_key"  varchar(200) NOT NULL,
  -- Soft-FK (niente REFERENCES per poter cancellare il post senza perdere la storia earn)
  "reference_id"     uuid,
  "created_at"       timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "rewards_ledger_user_idempotency_uq"
  ON "rewards_ledger"("user_id", "idempotency_key");

-- Hot path: quanti accrediti oggi per un dato (user, event_type)?
-- Usato dal daily_cap check nel trigger e nel service applicativo.
CREATE INDEX IF NOT EXISTS "idx_rewards_ledger_user_event_date"
  ON "rewards_ledger"("user_id", "event_type", "created_at" DESC);

-- ─── rewards_balances ────────────────────────────────────────────────────────
-- Aggiornato via trigger — mai scrivere direttamente dall'applicazione.

CREATE TABLE IF NOT EXISTS "rewards_balances" (
  "user_id"         uuid    PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "balance"         bigint  NOT NULL DEFAULT 0,
  "lifetime_earned" bigint  NOT NULL DEFAULT 0,
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

-- ─── Trigger: aggiorna saldo ad ogni INSERT su ledger ────────────────────────

CREATE OR REPLACE FUNCTION rewards_update_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO rewards_balances(user_id, balance, lifetime_earned, updated_at)
  VALUES (NEW.user_id, NEW.amount, NEW.amount, now())
  ON CONFLICT (user_id) DO UPDATE SET
    balance         = rewards_balances.balance + NEW.amount,
    lifetime_earned = rewards_balances.lifetime_earned + NEW.amount,
    updated_at      = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rewards_ledger_balance_trg
  AFTER INSERT ON rewards_ledger
  FOR EACH ROW EXECUTE FUNCTION rewards_update_balance();

-- ─── Trigger: like_received — accredita l'autore del post ────────────────────
-- Si aggancia a posts_reactions (INSERT). Pattern identico a M_notifications_001.
-- Gestisce: fetch autore post, anti-self-reward, daily_cap check, idempotency.

CREATE OR REPLACE FUNCTION rewards_on_reaction_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_author_id uuid;
  v_amount    integer;
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
  IF NOT FOUND OR NOT v_enabled THEN RETURN NEW; END IF;

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

CREATE TRIGGER rewards_reaction_insert_trg
  AFTER INSERT ON posts_reactions
  FOR EACH ROW EXECUTE FUNCTION rewards_on_reaction_insert();

-- ─── Seed regole di default ───────────────────────────────────────────────────
-- Valori alpha: generosi per testare in dev / early users.
-- L'admin può modificare amount e daily_cap da /admin/modules/rewards/settings.

INSERT INTO rewards_rules(event_type, amount, daily_cap, enabled) VALUES
  ('daily_checkin', 10, NULL, true),  -- 1 volta/giorno per definizione (idempotency key sulla data)
  ('post_created',   5,    3, true),  -- max 15 coin/giorno da post (cap anti-spam)
  ('like_received',  1,   20, true)   -- max 20 coin/giorno da like ricevuti
ON CONFLICT (event_type) DO NOTHING;
