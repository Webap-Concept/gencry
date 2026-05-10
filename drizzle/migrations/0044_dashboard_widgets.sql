-- Migration: 0044_dashboard_widgets.sql
-- Adds the persistence backing for the admin dashboard widget system.
--
-- Two storage points, three resolution levels (top wins):
--   1. user override   → admin_user_preferences.dashboard_widgets
--   2. role preset     → roles.dashboard_widgets
--   3. registry default → hardcoded `defaultEnabled` on each widget
--
-- Why a separate table for user prefs (not a column on `users`):
--   `users` is shared between frontend/app users and admin/staff. Admin-only
--   columns would pollute every row of the public table. The 1:1 pattern
--   `<feature>_<user>_preferences/state` is already used in the project for
--   the same reason (user_mfa_totp, user_subscriptions, ecc.).
--
-- Generic name `admin_user_preferences` so future staff-only preferences
-- (sidebar density, quiet hours, ecc.) can land here without another table.
--
-- Eseguire nel SQL Editor di Supabase. Idempotente.

-- ─── 1) admin_user_preferences ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dashboard_widgets JSONB,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  admin_user_preferences IS
  'Per-user staff preferences. One row per admin that has customized something. Absent row = inherit from role preset / registry defaults.';
COMMENT ON COLUMN admin_user_preferences.dashboard_widgets IS
  'Shape: { "enabled": string[] } where each string is a widget id from the registry. NULL = no user override (use role preset or registry default).';

-- ─── 2) roles.dashboard_widgets ─────────────────────────────────────────
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS dashboard_widgets JSONB;

COMMENT ON COLUMN roles.dashboard_widgets IS
  'Default dashboard preset for users with this role. Shape: { "enabled": string[] } | NULL. NULL = use registry defaults.';
