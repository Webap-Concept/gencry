-- =============================================================================
-- Module: Onboarding — 002 choices (coin picks + risk profile)
-- =============================================================================
-- Schema delle scelte dell'utente nel wizard:
--   - onboarding_coin_picks   1:N (3..20 coin per utente)
--   - onboarding_risk_profile 1:1 (profilo rischio + esperienza)
--
-- La completion del wizard resta su `users.onboarding_completed_at` (core),
-- niente tabella `onboarding_completions` aggiuntiva — vedi
-- feedback_module_isolation.md per il razionale.
--
-- Nota su userProfiles.interests:
--   Il wizard precedente salvava le scelte come array text in
--   `user_profiles.interests` (mock-only). Non droppiamo quella colonna in
--   questa migration per non rompere eventuali consumer non-onboarding;
--   sarà rimossa in una migration core dedicata quando si confermerà
--   che nessun altro punto la legge.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CHECK constraints inline.
-- Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Coin scelte dall'utente (3..20) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_coin_picks" (
  "user_id"     uuid         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coin_symbol" varchar(20)  NOT NULL REFERENCES "prices_coins"("symbol") ON DELETE CASCADE,
  "position"    smallint     NOT NULL DEFAULT 0,
  "created_at"  timestamptz  NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "coin_symbol")
);

CREATE INDEX IF NOT EXISTS "idx_onboarding_coin_picks_user"
  ON "onboarding_coin_picks" ("user_id", "position");

-- Per future query "quanti utenti hanno scelto questa coin"
CREATE INDEX IF NOT EXISTS "idx_onboarding_coin_picks_coin"
  ON "onboarding_coin_picks" ("coin_symbol");

-- ── 2) Risk profile + esperienza (1:1) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_risk_profile" (
  "user_id"     uuid         PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "profile"     varchar(20)  NOT NULL,
  "experience"  varchar(20)  NOT NULL,
  "created_at"  timestamptz  NOT NULL DEFAULT NOW(),
  "updated_at"  timestamptz  NOT NULL DEFAULT NOW(),
  CONSTRAINT "onboarding_risk_profile_profile_check"
    CHECK ("profile" IN ('cauto', 'moderato', 'aggressivo', 'degen')),
  CONSTRAINT "onboarding_risk_profile_experience_check"
    CHECK ("experience" IN ('newbie', '1to3y', 'over3y'))
);
