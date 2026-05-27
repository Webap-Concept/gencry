-- =============================================================================
-- Sessions impersonation — back-pointer + permission
-- =============================================================================
--
-- Aggiunge:
--   1. Colonna `impersonator_session_id` su `sessions` (FK self-ref nullable):
--      pointer alla sessione admin originale che ha avviato un'impersonation.
--      Quando un admin "diventa" un altro utente, viene creata una NUOVA
--      sessione per il target con questo campo valorizzato col session-id
--      dell'admin. Stop impersonation = revoca questa sessione + ripristina
--      il cookie col sid admin.
--      ON DELETE SET NULL: se la session admin originale viene eliminata
--      (es. logout esplicito), la sessione impersonation resta valida fino
--      al naturale expiresAt (30 min) — l'admin si troverà logged-out al
--      termine senza poter tornare admin, deve rifare il login.
--
--   2. Permission `users:impersonate`: gating dell'azione. Auto-granted ad
--      admin role di sistema (cerco il role 'admin' built-in).
--
-- Idempotente. Da incollare nel SQL Editor di Supabase.
-- =============================================================================

BEGIN;

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "impersonator_session_id" uuid
    REFERENCES "sessions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_sessions_impersonator"
  ON "sessions" ("impersonator_session_id")
  WHERE "impersonator_session_id" IS NOT NULL;

INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('users:impersonate', 'Impersonate other users (admin tool)', 'Users', true)
ON CONFLICT ("key") DO NOTHING;

-- Auto-grant al role admin built-in (idempotente).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'users:impersonate'
ON CONFLICT DO NOTHING;

COMMIT;
