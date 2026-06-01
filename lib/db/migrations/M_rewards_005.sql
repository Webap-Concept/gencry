-- M_rewards_005.sql
--
-- Modulo Rewards: spending engine.
-- - rewards_catalog  — catalogo item acquistabili con GCC (badge + perk)
-- - user_badges      — badge assegnati agli utenti (acquistati o di sistema)
-- - rewards_redemptions — audit trail acquisti (punta alla entry ledger negativa)
--
-- Seed V1: 3 item (badge_supporter, badge_whale, watchlist_slot).
-- Da incollare nel Supabase SQL Editor dopo M_rewards_004.

-- ─── rewards_catalog ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "rewards_catalog" (
  "id"          uuid        PRIMARY KEY DEFAULT uuid_generate_v7(),
  "slug"        varchar(50) NOT NULL UNIQUE,
  "label"       varchar(100) NOT NULL,
  "description" text,
  "type"        varchar(20) NOT NULL CHECK (type IN ('badge','perk')),
  "icon_url"    text,
  "icon_bg"     varchar(20),
  "cost_gcc"    numeric(10,2) NOT NULL DEFAULT 0
                CONSTRAINT rewards_catalog_cost_pos CHECK (cost_gcc >= 0),
  "is_active"   boolean NOT NULL DEFAULT true,
  "is_unique"   boolean NOT NULL DEFAULT true,
  "perk_data"   jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_rewards_catalog_active"
  ON "rewards_catalog"("is_active", "type");

-- ─── user_badges ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_badges" (
  "id"              uuid        PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"         uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_slug"      varchar(50) NOT NULL,
  "source"          varchar(20) NOT NULL CHECK (source IN ('purchase','system')),
  "catalog_item_id" uuid        REFERENCES "rewards_catalog"("id") ON DELETE SET NULL,
  "granted_at"      timestamptz NOT NULL DEFAULT now(),
  "revoked_at"      timestamptz,
  "expires_at"      timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_user_badges_user_active"
  ON "user_badges"("user_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "idx_user_badges_slug"
  ON "user_badges"("badge_slug");

-- ─── rewards_redemptions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "rewards_redemptions" (
  "id"              uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"         uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "catalog_item_id" uuid          NOT NULL REFERENCES "rewards_catalog"("id") ON DELETE RESTRICT,
  "gcc_spent"       numeric(10,2) NOT NULL,
  "ledger_entry_id" uuid          REFERENCES "rewards_ledger"("id") ON DELETE SET NULL,
  "redeemed_at"     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_rewards_redemptions_user"
  ON "rewards_redemptions"("user_id", "redeemed_at");
CREATE INDEX IF NOT EXISTS "idx_rewards_redemptions_item"
  ON "rewards_redemptions"("catalog_item_id");

-- ─── Seed catalogo V1 ────────────────────────────────────────────────────────

INSERT INTO rewards_catalog(slug, label, description, type, icon_bg, cost_gcc, is_active, is_unique, perk_data)
VALUES
  (
    'badge_supporter',
    'Supporter',
    'Hai sostenuto la community GCC acquistando questo badge.',
    'badge',
    '#f97316',
    500,
    true,
    true,
    NULL
  ),
  (
    'badge_whale',
    'Whale',
    'Collezionista di GCC. Hai dimostrato un impegno straordinario.',
    'badge',
    '#8b5cf6',
    2000,
    true,
    true,
    NULL
  ),
  (
    'watchlist_slot',
    '+1 Slot Watchlist',
    'Sblocca uno slot aggiuntivo per le tue watchlist crypto.',
    'perk',
    '#0ea5e9',
    300,
    true,
    false,
    '{"slots_granted": 1}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

-- ─── Fix trigger balance: lifetime_earned non diminuisce su redemption ────────
-- Il trigger originale (M_rewards_001) sommava NEW.amount anche a lifetime_earned,
-- ma per le redemptions (amount negativo) vogliamo decrementare solo balance.
-- lifetime_earned è un running total degli earn — non deve mai scendere.

CREATE OR REPLACE FUNCTION rewards_update_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO rewards_balances(user_id, balance, lifetime_earned, updated_at)
  VALUES (
    NEW.user_id,
    NEW.amount,
    GREATEST(NEW.amount, 0),  -- lifetime_earned += amount solo se positivo
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance         = rewards_balances.balance + NEW.amount,
    lifetime_earned = rewards_balances.lifetime_earned + GREATEST(NEW.amount, 0),
    updated_at      = now();
  RETURN NEW;
END;
$$;
