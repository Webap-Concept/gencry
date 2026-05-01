-- =============================================================================
-- Migration 0026: Prices Engine
-- =============================================================================
-- Modulo Prezzi (Decisione 1 dell'architettura social — vedi memory).
--
-- Architettura:
--   1) Edge route /api/cron/prices-sync (cron 5min)
--      - calcola active universe (coin in watchlist + post negli ultimi N ore)
--      - chiama CoinGecko /simple/price (primaria)
--      - fallback DexScreener tramite circuit breaker
--      - upsert su `prices` solo se delta > soglia configurata
--
--   2) Edge route /api/cron/prices-snapshot (cron 5min)
--      - INSERT su `coin_prices` (timeseries) per le sparkline storiche
--
--   3) Edge route /api/cron/prices-cleanup (giornaliero)
--      - DELETE da `coin_prices` oltre la retention (default 30gg)
--
-- Tutti i parametri (cron interval, active universe window, delta soglia,
-- retention, circuit breaker thresholds) sono in `app_settings` e modificabili
-- dall'admin senza redeploy. Le route leggono i valori ad ogni esecuzione.
--
-- Idempotente: può essere ri-eseguita senza effetti collaterali.
--
-- Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- 1) Catalogo coin trackati (metadata + ultima volta visti nell'universo attivo)
CREATE TABLE IF NOT EXISTS "coins" (
  "symbol"        varchar(20)   PRIMARY KEY,
  "coingecko_id"  varchar(100)  UNIQUE,
  "name"          varchar(120)  NOT NULL,
  "image_url"     text,
  "market_cap"    bigint,
  "category"      varchar(50),
  "is_active"     boolean       NOT NULL DEFAULT true,
  "last_seen_at"  timestamptz   NOT NULL DEFAULT NOW(),
  "created_at"    timestamptz   NOT NULL DEFAULT NOW(),
  "updated_at"    timestamptz   NOT NULL DEFAULT NOW()
);

-- Indice per query "coin attivi ordinati per market cap" (ticker, watchlist)
CREATE INDEX IF NOT EXISTS "idx_coins_active_mcap"
  ON "coins" ("is_active", "market_cap" DESC NULLS LAST);

-- 2) Prezzo corrente (1 riga per coin, aggiornata dal cron-sync)
CREATE TABLE IF NOT EXISTS "prices" (
  "symbol"          varchar(20)   PRIMARY KEY
                    REFERENCES "coins"("symbol") ON DELETE CASCADE,
  "price"           numeric(24,8) NOT NULL,
  "change_24h"      numeric(10,4),
  "volume_24h"      numeric(24,2),
  "source"          varchar(20)   NOT NULL DEFAULT 'coingecko',
  "last_updated"    timestamptz   NOT NULL DEFAULT NOW()
);

-- 3) Prezzi storici (timeseries per sparkline reali)
CREATE TABLE IF NOT EXISTS "coin_prices" (
  "id"      bigserial     PRIMARY KEY,
  "symbol"  varchar(20)   NOT NULL
            REFERENCES "coins"("symbol") ON DELETE CASCADE,
  "ts"      timestamptz   NOT NULL DEFAULT NOW(),
  "price"   numeric(24,8) NOT NULL
);

-- Indice per query "ultimi N punti per coin" (sparkline)
CREATE INDEX IF NOT EXISTS "idx_coin_prices_symbol_ts"
  ON "coin_prices" ("symbol", "ts" DESC);

-- 4) Health/state della pipeline ingestion (per circuit breaker e admin dashboard)
-- Una riga per source ('coingecko', 'dexscreener'). Aggiornata ad ogni run.
CREATE TABLE IF NOT EXISTS "prices_source_health" (
  "source"           varchar(20)  PRIMARY KEY,
  "status"           varchar(20)  NOT NULL DEFAULT 'closed',     -- closed | open | half-open
  "error_count"      integer      NOT NULL DEFAULT 0,
  "success_count"    integer      NOT NULL DEFAULT 0,
  "last_error"       text,
  "last_error_at"    timestamptz,
  "last_success_at"  timestamptz,
  "open_until"       timestamptz,
  "avg_latency_ms"   integer,
  "updated_at"       timestamptz  NOT NULL DEFAULT NOW()
);

-- Inizializza le due righe di default
INSERT INTO "prices_source_health" ("source") VALUES ('coingecko')
  ON CONFLICT ("source") DO NOTHING;
INSERT INTO "prices_source_health" ("source") VALUES ('dexscreener')
  ON CONFLICT ("source") DO NOTHING;

-- 5) Log per ogni run del cron (per admin dashboard "External APIs health")
CREATE TABLE IF NOT EXISTS "prices_sync_runs" (
  "id"             bigserial    PRIMARY KEY,
  "kind"           varchar(20)  NOT NULL,            -- sync | snapshot | cleanup
  "started_at"     timestamptz  NOT NULL DEFAULT NOW(),
  "finished_at"    timestamptz,
  "duration_ms"    integer,
  "coins_total"    integer      NOT NULL DEFAULT 0,
  "coins_updated"  integer      NOT NULL DEFAULT 0,
  "source_used"    varchar(20),                       -- coingecko | dexscreener | mixed
  "ok"             boolean      NOT NULL DEFAULT false,
  "error"          text
);

CREATE INDEX IF NOT EXISTS "idx_prices_sync_runs_kind_started"
  ON "prices_sync_runs" ("kind", "started_at" DESC);

-- 6) Settings di default per il modulo prezzi
-- Tutti i valori sono stringhe (convenzione di app_settings).
-- I tipi sono interpretati lato app:
--   prices_cron_minutes      → integer minuti
--   prices_universe_hours    → integer ore
--   prices_delta_threshold   → float percent (0.0005 = 0.05%)
--   prices_kv_ttl_seconds    → integer secondi
--   prices_breaker_max_err   → integer
--   prices_breaker_window_s  → integer secondi
--   prices_breaker_open_s    → integer secondi
--   prices_snapshot_minutes  → integer minuti
--   prices_retention_days    → integer giorni
INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('prices_cron_minutes',     '5',     NOW()),
  ('prices_universe_hours',   '24',    NOW()),
  ('prices_delta_threshold',  '0.0005',NOW()),
  ('prices_kv_ttl_seconds',   '30',    NOW()),
  ('prices_breaker_max_err',  '3',     NOW()),
  ('prices_breaker_window_s', '300',   NOW()),
  ('prices_breaker_open_s',   '600',   NOW()),
  ('prices_snapshot_minutes', '5',     NOW()),
  ('prices_retention_days',   '30',    NOW())
ON CONFLICT ("key") DO NOTHING;

-- 7) Permessi RBAC per la sezione admin Prices
INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('admin:prices', 'Access Prices section', 'Admin', true)
ON CONFLICT ("key") DO NOTHING;

-- Concedi admin:prices al ruolo admin (super-admin eredita tutto)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'admin:prices'
ON CONFLICT DO NOTHING;
