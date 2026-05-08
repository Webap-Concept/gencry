-- 0037_admin_url_slug_setting.sql
-- Aggiunge il setting `admin.url_slug` a app_settings con default 'admin'.
--
-- Permette all'admin di rinominare a runtime il prefisso URL del pannello
-- (es. /admin → /admincontrol) dalla UI senza redeploy. Il proxy.ts legge
-- questo valore (cached 60s con tag ADMIN_URL_SLUG_TAG) per matchare le
-- rotte admin contro il segmento dinamico [adminSlug].
--
-- Constraint UI-side (validati in lib/admin-paths.ts):
--   - regex /^[a-z0-9][a-z0-9_-]{1,39}$/ (2..40 char, lowercase, no slash)
--   - non in lista riservati (api, _next, sign-in, sign-up, verify-email,
--     forgot-password, reset-password, verify-device, staff-invite,
--     onboarding, unauthorized, settings, profilo, notifiche, esplora,
--     it, en, humans.txt, robots.txt, ecc.)
--   - non collidente con uno slug esistente in `pages` (eccetto le system
--     pages admin_home / admin_sign_in che vengono aggiornate insieme)

INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('admin.url_slug', 'admin', NOW())
ON CONFLICT ("key") DO NOTHING;
