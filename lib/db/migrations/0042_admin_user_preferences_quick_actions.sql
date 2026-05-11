-- 0042_admin_user_preferences_quick_actions.sql
--
-- Add a per-admin override for which Quick Actions tiles show up on
-- the dashboard. NULL = the user never customized → widget falls back
-- to the 4 built-in defaults (users-list / users-roles / content-pages
-- / settings-general). Values are nav-registry keys, capped at 10
-- entries client-side AND server-side (enforced by the action; no DB
-- CHECK because Postgres array length checks are awkward to evolve).

ALTER TABLE admin_user_preferences
  ADD COLUMN IF NOT EXISTS quick_actions text[] DEFAULT NULL;
