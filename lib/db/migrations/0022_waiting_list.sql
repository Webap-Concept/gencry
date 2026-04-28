-- Migration 0022: waiting_list + email_waitinglist_* template settings
--
-- waiting_list: tabella delle iscrizioni dalla landing page coming-soon.
-- - email UNIQUE: stessa email puo' provare di nuovo, ma non duplica.
-- - ip_address / user_agent: audit minimo, utili per anti-abuse e statistiche.
--
-- I 4 setting email_waitinglist_* abilitano la personalizzazione del template
-- dal pannello admin (tab "Email templates"). NULL = usa il default hardcoded.

CREATE TABLE IF NOT EXISTS "waiting_list" (
  "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"       varchar(255)  NOT NULL UNIQUE,
  "ip_address"  varchar(45),
  "user_agent"  text,
  "created_at"  timestamptz   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_waiting_list_created_at"
  ON "waiting_list" ("created_at" DESC);

INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('email_waitinglist_subject', NULL, NOW()),
  ('email_waitinglist_bcc',     NULL, NOW()),
  ('email_waitinglist_body',    NULL, NOW()),
  ('email_waitinglist_footer',  NULL, NOW())
ON CONFLICT ("key") DO NOTHING;
