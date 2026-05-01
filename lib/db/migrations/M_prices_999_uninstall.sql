-- =============================================================================
-- Module: Prices Engine — 999 uninstall
-- =============================================================================
-- Disinstalla completamente il modulo Prices Engine.
-- Eseguire SOLO se si vuole rimuovere il modulo dall'app.
--
-- DOPO l'esecuzione SQL: rimuovere PRICES_MODULE da
-- `lib/modules/registry.ts` e cancellare la cartella `lib/modules/prices/`,
-- `app/(admin)/admin/modules/prices/`, `app/api/cron/modules/prices/` e le
-- relative entries in `vercel.json`.
--
-- Idempotente.
-- =============================================================================

-- ── 1) Rimuovi i grant role→permission ──────────────────────────────────
DELETE FROM "role_permissions"
  WHERE permission_id IN (SELECT id FROM "permissions" WHERE key = 'modules:prices');

-- ── 2) Rimuovi i grant utente diretti ───────────────────────────────────
DELETE FROM "user_permissions"
  WHERE permission_id IN (SELECT id FROM "permissions" WHERE key = 'modules:prices');

-- ── 3) Rimuovi la permission ────────────────────────────────────────────
DELETE FROM "permissions" WHERE key = 'modules:prices';

-- ── 4) Rimuovi le settings keys ─────────────────────────────────────────
DELETE FROM "app_settings" WHERE key LIKE 'modules.prices.%';

-- ── 5) Droppa le tabelle (in ordine inverso ai FK) ──────────────────────
DROP TABLE IF EXISTS "prices_sync_runs"     CASCADE;
DROP TABLE IF EXISTS "prices_source_health" CASCADE;
DROP TABLE IF EXISTS "coin_prices"          CASCADE;
DROP TABLE IF EXISTS "prices"               CASCADE;
DROP TABLE IF EXISTS "coins"                CASCADE;
