-- =============================================================================
-- Module: Prices Engine — 003 R2 storage settings
-- =============================================================================
-- Aggiunge le 5 chiavi di config per il bucket Cloudflare R2 dove il modulo
-- prices auto-hosta le coin images (scaricate da CoinGecko al momento
-- dell'add coin / refetch). Gli URL su prices_coins.image_url passeranno
-- da `assets.coingecko.com/...` (esterno) a `<R2_PUBLIC_BASE_URL>/<symbol>.png`
-- (interno) — egress 0 e niente fetch esterni dal frontend pubblico.
--
-- Convenzione (vedi project_social_storage_r2.md): un bucket per modulo,
-- API token scoped a quel solo bucket, settings nel namespace
-- `modules.<slug>.<key>`.
--
-- Tutti i valori partono come stringhe vuote. Finché account_id +
-- access_key_id + secret_access_key + bucket + public_base_url non sono
-- TUTTI valorizzati, `lib/modules/prices/storage.ts` considera R2 come
-- non configurato e fa graceful degradation: salva l'URL CoinGecko legacy
-- (admin vede l'icona "Non configurato" nella card R2 della pagina settings).
--
-- Idempotente: ON CONFLICT DO NOTHING. Da incollare nel Supabase SQL Editor.
-- =============================================================================

INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('modules.prices.r2.account_id',         '', NOW()),
  ('modules.prices.r2.access_key_id',      '', NOW()),
  ('modules.prices.r2.secret_access_key',  '', NOW()),
  ('modules.prices.r2.bucket',             '', NOW()),
  ('modules.prices.r2.public_base_url',    '', NOW())
ON CONFLICT ("key") DO NOTHING;
