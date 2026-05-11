-- =============================================================================
-- Module: Onboarding — 001 init
-- =============================================================================
-- Promuove l'onboarding a modulo registrato:
--   - sposta il setting `onboarding_enabled` (core) → `modules.onboarding.enabled`
--     (namespace modulare standard, vedi project_modular_architecture.md)
--   - aggiunge la permission RBAC `modules:onboarding` (gruppo "Modules")
--
-- Lo schema delle tabelle del modulo (`onboarding_coin_picks`,
-- `onboarding_risk_profile`) arriverà con M_onboarding_002_choices.sql in
-- una PR successiva — qui ci limitiamo al refactor settings/RBAC.
--
-- Wizard, gate (lib/auth/onboarding-gate.ts), username generator e
-- colonna `users.onboarding_completed_at` restano nel core perché:
--   - il gate è chiamato dai 5 flussi auth (signin/oauth/verify-*/mfa)
--   - il generator è il fallback per OAuth quando l'onboarding è disattivo
--   - la colonna è la fonte di verità del "profilo completato"
-- (vedi feedback_module_isolation.md per il razionale).
--
-- Idempotente: ON CONFLICT DO NOTHING + WHERE NOT EXISTS ovunque.
-- Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) Settings: copia onboarding_enabled → modules.onboarding.enabled ──────
-- Se la chiave nuova non esiste ancora, prendi il valore da quella vecchia
-- (default 'true' se nemmeno quella esiste).
INSERT INTO "app_settings" ("key", "value", "updated_at")
SELECT
  'modules.onboarding.enabled',
  COALESCE(
    (SELECT value FROM "app_settings" WHERE key = 'onboarding_enabled'),
    'true'
  ),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "app_settings" WHERE key = 'modules.onboarding.enabled'
);

-- ── 2) Settings: rimuovi la chiave legacy ──────────────────────────────────
DELETE FROM "app_settings" WHERE key = 'onboarding_enabled';

-- ── 3) Permission RBAC `modules:onboarding` ────────────────────────────────
INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('modules:onboarding', 'Access Onboarding module', 'Modules', true)
ON CONFLICT ("key") DO NOTHING;

-- ── 4) Concedi modules:onboarding al ruolo admin ───────────────────────────
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'modules:onboarding'
ON CONFLICT DO NOTHING;
