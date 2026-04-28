-- Migration 0021: admin_notifications
-- Tabella centrale per le notifiche del pannello admin.
--
-- Stati di una notifica:
--   - "attiva":   dismissed_at IS NULL AND resolved_at IS NULL
--                 AND (snoozed_until IS NULL OR snoozed_until < now())
--   - "letta":    read_at IS NOT NULL
--   - "rinviata": snoozed_until > now()  (sparisce dal bell fino a quella data)
--   - "ignorata": dismissed_at IS NOT NULL  (chiusa dall'admin)
--   - "risolta":  resolved_at IS NOT NULL  (auto-chiusa dal dispatcher
--                 quando la condizione che l'ha generata svanisce)
--
-- dedup_key e' unique e idempotente: ogni generatore produce sempre
-- la stessa chiave per la stessa condizione (es. "rotation:google_client_secret").
-- Questo permette al dispatcher di fare upsert senza duplicare.
--
-- required_permission: chiave RBAC necessaria per vedere la notifica.
-- Il filtro avviene in lettura (WHERE required_permission = ANY(perms_admin)).

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id"                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"                varchar(50)  NOT NULL,
  "severity"            varchar(20)  NOT NULL DEFAULT 'info',
  "title"               text         NOT NULL,
  "body"                text,
  "link"                text,
  "dedup_key"           varchar(200) NOT NULL UNIQUE,
  "required_permission" varchar(100) NOT NULL,
  "metadata"            jsonb        NOT NULL DEFAULT '{}'::jsonb,
  "created_at"          timestamptz  NOT NULL DEFAULT NOW(),
  "read_at"             timestamptz,
  "snoozed_until"       timestamptz,
  "dismissed_at"        timestamptz,
  "resolved_at"         timestamptz
);

-- Indice parziale per la query del bell:
--   filtra per permesso, ordinato per data, solo notifiche non chiuse.
CREATE INDEX IF NOT EXISTS "idx_admin_notifications_active"
  ON "admin_notifications" ("required_permission", "created_at" DESC)
  WHERE "dismissed_at" IS NULL AND "resolved_at" IS NULL;

-- Riga di stato per il throttle del dispatcher (lazy run, max una volta/ora).
INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('notifications_dispatcher_last_run', NULL, NOW())
ON CONFLICT ("key") DO NOTHING;
