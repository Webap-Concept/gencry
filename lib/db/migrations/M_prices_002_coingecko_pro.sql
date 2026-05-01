-- =============================================================================
-- Module: Prices Engine — 002 CoinGecko Pro support
-- =============================================================================
-- Aggiunge 2 settings al namespace `modules.prices.*`:
--   - coingecko_pro_enabled : 'true' | 'false' (default 'false')
--   - coingecko_pro_api_key : NULL all'inizio
--
-- Quando enabled = true e api_key è valorizzato, l'adapter coingecko.ts usa
-- l'endpoint pro-api.coingecko.com con header x-cg-pro-api-key.
--
-- Idempotente.
-- =============================================================================

INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('modules.prices.coingecko_pro_enabled', 'false', NOW()),
  ('modules.prices.coingecko_pro_api_key', NULL,    NOW())
ON CONFLICT ("key") DO NOTHING;
