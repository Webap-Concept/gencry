-- =============================================================================
-- Price exchanges registry — PR1 del refactor "Redis-first prices"
-- =============================================================================
--
-- Aggiunge l'infrastruttura per il pattern multi-exchange descritto in
-- memoria del progetto:
--
--   1. Tabella `price_exchanges` — config registry degli adapter
--      disponibili (Binance, KuCoin, Gate.io, Kraken, …). Niente API key
--      qui (alcuni free no-auth), valorizzata dall'admin quando serve.
--
--   2. `prices_coins.preferred_exchange` + `exchange_symbol` — per ogni
--      coin nel registry possiamo dire "questo BTC arriva da Binance con
--      symbol BTCUSDT", oppure "questo COIN_X arriva da KuCoin con
--      symbol COINX-USDT". Coin senza preferred_exchange → fallback al
--      vecchio percorso CoinGecko (compat).
--
-- IMPORTANTE: PR1 e' solo "infrastructure laid". Il cron continua a usare
-- CoinGecko al 100%. Il routing reale arrivera' in PR2.
--
-- Idempotente. Incollare nel Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1. price_exchanges (config admin + status) ────────────────────────────
CREATE TABLE IF NOT EXISTS "price_exchanges" (
  "id"                varchar(20) PRIMARY KEY,                      -- "binance", "kucoin", "gate", ...
  "label"             varchar(64) NOT NULL,
  "enabled"           boolean NOT NULL DEFAULT true,
  "api_key"           text,                                          -- nullable: alcuni free no-auth
  "api_secret"        text,                                          -- nullable
  "config"            jsonb NOT NULL DEFAULT '{}'::jsonb,            -- per-exchange settings extra
  "last_health_check" timestamptz,
  "last_health_ok"    boolean,
  "last_health_error" text,
  "created_at"        timestamptz NOT NULL DEFAULT NOW(),
  "updated_at"        timestamptz NOT NULL DEFAULT NOW()
);

-- Seed di Binance come primo adapter (l'admin vedra' immediatamente
-- l'exchange in /admin/services/exchanges quando arrivera' la UI).
INSERT INTO "price_exchanges" ("id", "label", "enabled")
VALUES ('binance', 'Binance', true)
ON CONFLICT ("id") DO NOTHING;

-- ── 2. prices_coins: routing per-coin ────────────────────────────────────
ALTER TABLE "prices_coins"
  ADD COLUMN IF NOT EXISTS "preferred_exchange" varchar(20)
    REFERENCES "price_exchanges"("id") ON DELETE SET NULL;

ALTER TABLE "prices_coins"
  ADD COLUMN IF NOT EXISTS "exchange_symbol" varchar(50);

-- Indice per il cron group-by-exchange: WHERE is_active AND preferred_exchange IS NOT NULL
CREATE INDEX IF NOT EXISTS "idx_prices_coins_exchange_routing"
  ON "prices_coins" ("preferred_exchange", "is_active")
  WHERE "preferred_exchange" IS NOT NULL;

-- ── 3. Auto-mapping top coin (BTC → BTCUSDT, ETH → ETHUSDT, …) ───────────
-- Pattern Binance: <symbol>USDT per i top coin. Solo i coin gia' presenti
-- in prices_coins vengono aggiornati; i NUOVI coin admin li mappa via UI.
-- Idempotente: WHERE preferred_exchange IS NULL evita di sovrascrivere
-- routing custom messi dall'admin.
UPDATE "prices_coins"
   SET "preferred_exchange" = 'binance',
       "exchange_symbol" = UPPER("symbol") || 'USDT',
       "updated_at" = NOW()
 WHERE "preferred_exchange" IS NULL
   AND "is_active" = true
   AND UPPER("symbol") IN (
     -- Top 50 per market cap che hanno coppia USDT su Binance.
     -- Generato manualmente: stablecoins (USDT/USDC/DAI/...) escluse perche'
     -- non hanno pair self (USDT/USDT non esiste).
     'BTC','ETH','BNB','SOL','XRP','ADA','AVAX','DOGE','TRX','DOT',
     'LINK','MATIC','POL','TON','SHIB','LTC','BCH','UNI','ATOM','XLM',
     'NEAR','APT','ETC','FIL','ARB','OP','IMX','HBAR','VET','STX',
     'INJ','SUI','SEI','TIA','RUNE','RNDR','FET','GRT','AAVE','MKR',
     'LDO','SAND','MANA','AXS','CRV','SNX','COMP','1INCH','PEPE','WIF'
   );

COMMIT;
