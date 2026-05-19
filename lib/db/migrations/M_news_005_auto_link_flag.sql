-- =============================================================================
-- Module: News — 005 auto-link coins flag
-- =============================================================================
-- Aggiunge una colonna `auto_link_coins` per ogni news_item. Quando true, al
-- publish il modulo trasforma la PRIMA occorrenza del nome di un coin noto
-- (Bitcoin, Ethereum, …) in un link verso /coins/<symbol>. Cap a 1 link
-- per articolo per evitare il pattern "wall of blue text" che Google
-- considera spam-y.
--
-- La scelta è per-articolo (checkbox nel review editor), non globale:
-- l'admin decide caso per caso. Default `false` per non auto-modificare
-- gli articoli storici al re-publish.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

ALTER TABLE "news_items"
  ADD COLUMN IF NOT EXISTS "auto_link_coins" boolean NOT NULL DEFAULT false;
