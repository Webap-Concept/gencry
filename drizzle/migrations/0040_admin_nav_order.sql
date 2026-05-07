-- Migration: 0040_admin_nav_order.sql
-- Override globale dell'ordinamento delle voci top-level della sidebar
-- admin. Una row per item_key (es. "access-group", "settings-group",
-- "module-prices"). Le voci non override usano l'ordine del codice.
--
-- Solo top-level: niente ordering delle children (le sub-voci dentro
-- ogni gruppo restano nell'ordine del codice/manifest).
--
-- Eseguire nel SQL Editor di Supabase (idempotente via IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS admin_nav_order (
  item_key   varchar(64) PRIMARY KEY,
  sort_order integer NOT NULL,
  updated_at timestamp DEFAULT now()
);
