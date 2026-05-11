-- =============================================================================
-- Module: Onboarding — 999 uninstall
-- =============================================================================
-- Disinstalla completamente il modulo Onboarding.
-- Eseguire SOLO se si vuole rimuovere il modulo dall'app.
--
-- DOPO l'esecuzione SQL: rimuovere ONBOARDING_MODULE da
-- `lib/modules/registry.ts` e cancellare:
--   - `lib/modules/onboarding/`
--   - `app/(admin)/admin/modules/onboarding/`
--   - `app/(onboarding)/`
-- Quindi rimuovere anche il check `isOnboardingRequired` dai 5 flussi auth
-- (signin, oauth callback, verify-email, verify-device, mfa) — il gate in
-- `lib/auth/onboarding-gate.ts` può essere semplificato a no-op o rimosso.
--
-- Idempotente.
-- =============================================================================

-- ── 1) Rimuovi i grant role→permission ──────────────────────────────────
DELETE FROM "role_permissions"
  WHERE permission_id IN (SELECT id FROM "permissions" WHERE key = 'modules:onboarding');

-- ── 2) Rimuovi i grant utente diretti ───────────────────────────────────
DELETE FROM "user_permissions"
  WHERE permission_id IN (SELECT id FROM "permissions" WHERE key = 'modules:onboarding');

-- ── 3) Rimuovi la permission ────────────────────────────────────────────
DELETE FROM "permissions" WHERE key = 'modules:onboarding';

-- ── 4) Rimuovi le settings keys del modulo ──────────────────────────────
DELETE FROM "app_settings" WHERE key LIKE 'modules.onboarding.%';

-- ── 5) Droppa le tabelle del modulo (in ordine inverso ai FK) ───────────
DROP TABLE IF EXISTS "onboarding_risk_profile" CASCADE;
DROP TABLE IF EXISTS "onboarding_coin_picks"   CASCADE;
