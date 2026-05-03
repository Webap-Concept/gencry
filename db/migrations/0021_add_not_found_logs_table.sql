-- Migration: 0021_add_not_found_logs_table.sql
-- Crea la tabella not_found_logs per tracciare aggregato i 404 lato pubblico.
--
-- Scopo: monitor 404 nel pannello /admin/seo/not-found, da cui poi creare
-- i redirect (UI già esistente in /admin/seo/redirect).
--
-- Esecuzione:
--   incollare lo SQL qui sotto nel SQL Editor di Supabase.
--
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- Strategia "aggregato per path":
--   ogni richiesta a un URL inesistente fa UPSERT incrementando hit_count
--   e aggiornando last_hit_at / last_referrer / last_user_agent.
--   Il volume di righe è limitato dal numero di path distinti, non dal
--   numero di hit, quindi la tabella resta piccola anche sotto traffico.

-- ============================================================
-- 1. Tabella not_found_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS "not_found_logs" (
  "id"               BIGSERIAL PRIMARY KEY,
  "path"             VARCHAR(500) NOT NULL UNIQUE,
  "hit_count"        INTEGER NOT NULL DEFAULT 1,
  "last_referrer"    VARCHAR(500),
  "last_user_agent"  VARCHAR(500),
  "resolved_at"      TIMESTAMP,
  "first_hit_at"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "last_hit_at"      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Indici
-- ============================================================
-- Sort principale nell'admin: ordina per ultimo hit (più recenti in cima).
CREATE INDEX IF NOT EXISTS "idx_not_found_logs_last_hit"
  ON "not_found_logs" ("last_hit_at" DESC);

-- Partial index: la query di default mostra solo i non risolti, quindi
-- conviene un indice ridotto su quelle righe.
CREATE INDEX IF NOT EXISTS "idx_not_found_logs_unresolved"
  ON "not_found_logs" ("last_hit_at" DESC)
  WHERE "resolved_at" IS NULL;
