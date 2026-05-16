-- =============================================================================
-- 0046 — Drop duplicated R2 account_id from module-scoped settings
-- =============================================================================
-- Cloudflare Account ID è tenant-global: vive in `storage.r2.account_id`
-- ed è uno solo per tutto il deploy. Le righe `modules.prices.r2.account_id`
-- e `modules.posts.r2.account_id` duplicavano la stessa informazione
-- e creavano drift quando l'admin aggiornava una sola di esse.
--
-- Decisione 2026-05-14 (vedi project_modular_architecture §"Per-modulo
-- vs globale"): l'account_id viene letto SOLO da `storage.r2.account_id`;
-- i moduli leggono da lì.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

DELETE FROM "app_settings"
WHERE "key" IN (
  'modules.prices.r2.account_id',
  'modules.posts.r2.account_id'
);
