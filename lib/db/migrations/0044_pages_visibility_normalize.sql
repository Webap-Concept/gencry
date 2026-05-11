-- 0044_pages_visibility_normalize.sql
--
-- Bug fix: edit-save on /admin/content/pages/[id]/edit failed for
-- every system page with "Dati non validi". Root cause: the legacy
-- route_registry table allowed four visibility values
-- ('public', 'private', 'admin', 'auth-only') and migration 0034
-- imported those values into pages.visibility as-is. The Zod schema
-- in the editor accepts only 'public' | 'private', so any system
-- page carrying 'admin' or 'auth-only' tripped validation.
--
-- This migration:
--   1. Normalizes any non-canonical visibility to 'public'. That's
--      the safe default — the proxy (proxy.ts) handles system auth
--      routes (/sign-in, /sign-up, ...) via SYSTEM_AUTH_ROUTES BEFORE
--      checking the visibility list, so making them 'public' doesn't
--      grant unwanted access. The system handling is unchanged.
--   2. Adds a CHECK constraint so future inserts can't reintroduce
--      legacy values via direct SQL.

UPDATE pages
   SET visibility = 'public'
 WHERE visibility NOT IN ('public', 'private');

ALTER TABLE pages
  DROP CONSTRAINT IF EXISTS pages_visibility_check;

ALTER TABLE pages
  ADD CONSTRAINT pages_visibility_check
  CHECK (visibility IN ('public', 'private'));
