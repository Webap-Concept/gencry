-- =============================================================================
-- Module: Prices Engine — 007 CryptoCompare API key setting
-- =============================================================================
-- Aggiunge la chiave `modules.prices.cryptocompare_api_key` in app_settings.
-- Usata dal source CryptoCompare per il backfill storico via
-- `/data/v2/histohour` + `/data/v2/histoday`. La chiave è opzionale: senza,
-- l'API risponde comunque ma con rate limit pubblico più basso. Con chiave
-- (free su https://www.cryptocompare.com/cryptopian/api-keys) il limit
-- mensile sale a 250k req e quello al secondo è generoso.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('modules.prices.cryptocompare_api_key', '', NOW())
ON CONFLICT ("key") DO NOTHING;
