-- 0040_ip_rules.sql
-- Tabella per regole IP manuali (allow/deny) gestite dall'admin via
-- /admin/security/ip-rules. Coesiste con `ip_blacklist` esistente: quella è
-- popolata automaticamente da bruteforce, questa è la lista manuale.
-- Una PR successiva unificherà le due (vedi project memory).
--
-- Design perf-critical: la query DB su queste regole NON si fa per request.
-- Il loader server-side (`lib/auth/ip-rules.ts`) le carica una volta in
-- `unstable_cache` con tag-invalidation, e il match CIDR avviene in memoria.
-- Quindi: indici minimi (solo quelli che servono al loader e al cleanup),
-- niente GiST su inet — non serve perché non si fa lookup CIDR sul DB.
--
-- Scope:
--   'auth'   = applicato in lib/auth/rate-limit.ts (signup/login)
--   'admin'  = applicato in proxy.ts (solo se admin.ip_lockdown_enabled = true)
--   'all'    = applicato ovunque (placeholder per layer edge globale, v2)
--
-- Action:
--   'allow'  = bypass totale rate-limit/bruteforce; per scope='admin' = membro
--              della allowlist (richiesto quando lockdown è ON)
--   'deny'   = reject immediato

CREATE TABLE IF NOT EXISTS "ip_rules" (
  "id"          SERIAL PRIMARY KEY,
  "ip"          INET NOT NULL,
  "action"      VARCHAR(10) NOT NULL CHECK ("action" IN ('allow', 'deny')),
  "scope"       VARCHAR(10) NOT NULL CHECK ("scope" IN ('auth', 'admin', 'all')),
  "reason"      VARCHAR(255),
  "expires_at"  TIMESTAMP WITH TIME ZONE,
  "created_by"  UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "hit_count"   INTEGER NOT NULL DEFAULT 0,
  "last_hit_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "uq_ip_rules_ip_scope" UNIQUE ("ip", "scope")
);

-- Indice partial per il cron cleanup: filtra solo le righe con scadenza,
-- senza pesare le righe permanenti (NULL = mai scade, la maggior parte).
CREATE INDEX IF NOT EXISTS "idx_ip_rules_expires_at"
  ON "ip_rules" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

-- Toggle globale per la modalità admin lockdown. Default OFF: il proxy.ts
-- legge questo flag dal settings cache già esistente (zero overhead in più
-- rispetto allo stato attuale). Quando ON, il proxy fa un cache lookup
-- in-memory delle regole admin allow e nega l'accesso se l'IP non matcha.
INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('admin.ip_lockdown_enabled', 'false', NOW())
ON CONFLICT ("key") DO NOTHING;
