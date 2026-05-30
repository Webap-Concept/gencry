-- M_business_account_001.sql
--
-- Account azienda (business), v1 — identità visiva.
--   - user_profiles: campi azienda + account_type + verifica
--   - business_upgrade_requests: coda di approvazione admin
--
-- L'upgrade NON è self-service: l'utente invia una richiesta, un admin la
-- approva, e SOLO allora account_type passa a 'business'. La P.IVA
-- (vat_number) è dato privato per la verifica, mai esposto pubblicamente.
--
-- Da incollare nel Supabase SQL Editor.

-- 1) Campi azienda su user_profiles ------------------------------------------
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "account_type"        varchar(16) NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS "company_name"        varchar(120),
  ADD COLUMN IF NOT EXISTS "company_website"     varchar(255),
  ADD COLUMN IF NOT EXISTS "company_sector"      varchar(40),
  ADD COLUMN IF NOT EXISTS "company_vat_number"  varchar(32),
  ADD COLUMN IF NOT EXISTS "company_verified_at" timestamptz;

-- 2) Coda richieste di upgrade ----------------------------------------------
CREATE TABLE IF NOT EXISTS "business_upgrade_requests" (
  "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_name"    varchar(120) NOT NULL,
  "company_website" varchar(255) NOT NULL,
  "company_sector"  varchar(40)  NOT NULL,
  "vat_number"      varchar(32)  NOT NULL,
  "note"            text,
  "status"          varchar(16)  NOT NULL DEFAULT 'pending',
  "review_note"     text,
  "reviewed_by"     uuid,
  "reviewed_at"     timestamptz,
  "requested_at"    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_business_requests_user"
  ON "business_upgrade_requests" ("user_id", "requested_at");

CREATE INDEX IF NOT EXISTS "idx_business_requests_status"
  ON "business_upgrade_requests" ("status", "requested_at");
