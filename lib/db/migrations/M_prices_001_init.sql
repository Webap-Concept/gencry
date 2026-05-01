-- =============================================================================
-- Module: Prices Engine — 001 init
-- =============================================================================
-- Modulo Prezzi (Decisione 1 dell'architettura social — vedi memory).
--
-- Convenzioni della migrazione modulare:
--   - prefisso file: M_<slug>_NNN_<descrizione>.sql
--   - permission RBAC namespace `modules:<slug>`
--   - settings keys namespace `modules.<slug>.<chiave>`
--   - tabelle del modulo: nome libero (qui: coins, prices, coin_prices,
--     prices_source_health, prices_sync_runs)
--
-- Architettura runtime:
--   1) /api/cron/modules/prices/sync (cron 5min)
--      - calcola active universe (coin con last_seen_at entro N ore)
--      - chiama CoinGecko /simple/price (primaria)
--      - fallback DexScreener tramite circuit breaker
--      - upsert su `prices` solo se delta > soglia configurata
--
--   2) /api/cron/modules/prices/snapshot (cron 5min)
--      - INSERT su `coin_prices` (timeseries) per le sparkline storiche
--
--   3) /api/cron/modules/prices/cleanup (giornaliero)
--      - DELETE da `coin_prices` oltre la retention (default 30gg)
--
-- Tutti i parametri sono in `app_settings` (chiavi `modules.prices.*`)
-- e modificabili dall'admin senza redeploy.
--
-- Idempotente: può essere ri-eseguita senza effetti collaterali.
-- Compatibile con stato pre-modularizzazione: rinomina chiavi e permessi
-- vecchi (admin:prices, prices_*) ai nuovi nomi se presenti.
--
-- Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 0) Migrazione di compatibilità (se la versione pre-modulare era stata
-- eseguita: rinomina permission e settings keys ai nuovi nomi) ────────────
UPDATE "permissions" SET key = 'modules:prices', "group" = 'Modules', label = 'Access Prices Engine module'
  WHERE key = 'admin:prices';

UPDATE "app_settings" SET key = 'modules.prices.cron_minutes'      WHERE key = 'prices_cron_minutes';
UPDATE "app_settings" SET key = 'modules.prices.universe_hours'    WHERE key = 'prices_universe_hours';
UPDATE "app_settings" SET key = 'modules.prices.delta_threshold'   WHERE key = 'prices_delta_threshold';
UPDATE "app_settings" SET key = 'modules.prices.kv_ttl_seconds'    WHERE key = 'prices_kv_ttl_seconds';
UPDATE "app_settings" SET key = 'modules.prices.breaker_max_err'   WHERE key = 'prices_breaker_max_err';
UPDATE "app_settings" SET key = 'modules.prices.breaker_window_s' WHERE key = 'prices_breaker_window_s';
UPDATE "app_settings" SET key = 'modules.prices.breaker_open_s'    WHERE key = 'prices_breaker_open_s';
UPDATE "app_settings" SET key = 'modules.prices.snapshot_minutes'  WHERE key = 'prices_snapshot_minutes';
UPDATE "app_settings" SET key = 'modules.prices.retention_days'    WHERE key = 'prices_retention_days';

-- ── 1) Catalogo coin trackati ──────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS "idx_coins_active_mcap"
  ON "coins" ("is_active", "market_cap" DESC NULLS LAST);

-- ── 2) Prezzo corrente ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "prices" (
  "symbol"          varchar(20)   PRIMARY KEY
                    REFERENCES "coins"("symbol") ON DELETE CASCADE,
  "price"           numeric(24,8) NOT NULL,
  "change_24h"      numeric(10,4),
  "volume_24h"      numeric(24,2),
  "source"          varchar(20)   NOT NULL DEFAULT 'coingecko',
  "last_updated"    timestamptz   NOT NULL DEFAULT NOW()
);

-- ── 3) Timeseries per sparkline ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coin_prices" (
  "id"      bigserial     PRIMARY KEY,
  "symbol"  varchar(20)   NOT NULL
            REFERENCES "coins"("symbol") ON DELETE CASCADE,
  "ts"      timestamptz   NOT NULL DEFAULT NOW(),
  "price"   numeric(24,8) NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_coin_prices_symbol_ts"
  ON "coin_prices" ("symbol", "ts" DESC);

-- ── 4) Health/state delle source (per circuit breaker) ────────────────────
CREATE TABLE IF NOT EXISTS "prices_source_health" (
  "source"           varchar(20)  PRIMARY KEY,
  "status"           varchar(20)  NOT NULL DEFAULT 'closed',
  "error_count"      integer      NOT NULL DEFAULT 0,
  "success_count"    integer      NOT NULL DEFAULT 0,
  "last_error"       text,
  "last_error_at"    timestamptz,
  "last_success_at"  timestamptz,
  "open_until"       timestamptz,
  "avg_latency_ms"   integer,
  "updated_at"       timestamptz  NOT NULL DEFAULT NOW()
);

INSERT INTO "prices_source_health" ("source") VALUES ('coingecko')
  ON CONFLICT ("source") DO NOTHING;
INSERT INTO "prices_source_health" ("source") VALUES ('dexscreener')
  ON CONFLICT ("source") DO NOTHING;

-- ── 5) Log dei run cron ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "prices_sync_runs" (
  "id"             bigserial    PRIMARY KEY,
  "kind"           varchar(20)  NOT NULL,
  "started_at"     timestamptz  NOT NULL DEFAULT NOW(),
  "finished_at"    timestamptz,
  "duration_ms"    integer,
  "coins_total"    integer      NOT NULL DEFAULT 0,
  "coins_updated"  integer      NOT NULL DEFAULT 0,
  "source_used"    varchar(20),
  "ok"             boolean      NOT NULL DEFAULT false,
  "error"          text
);

CREATE INDEX IF NOT EXISTS "idx_prices_sync_runs_kind_started"
  ON "prices_sync_runs" ("kind", "started_at" DESC);

-- ── 6) Settings di default (chiavi `modules.prices.*`) ────────────────────
INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('modules.prices.cron_minutes',     '5',     NOW()),
  ('modules.prices.universe_hours',   '24',    NOW()),
  ('modules.prices.delta_threshold',  '0.0005',NOW()),
  ('modules.prices.kv_ttl_seconds',   '30',    NOW()),
  ('modules.prices.breaker_max_err',  '3',     NOW()),
  ('modules.prices.breaker_window_s', '300',   NOW()),
  ('modules.prices.breaker_open_s',   '600',   NOW()),
  ('modules.prices.snapshot_minutes', '5',     NOW()),
  ('modules.prices.retention_days',   '30',    NOW())
ON CONFLICT ("key") DO NOTHING;

-- ── 7) Permission RBAC `modules:prices` ───────────────────────────────────
INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('modules:prices', 'Access Prices Engine module', 'Modules', true)
ON CONFLICT ("key") DO NOTHING;

-- Concedi modules:prices al ruolo admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'modules:prices'
ON CONFLICT DO NOTHING;
