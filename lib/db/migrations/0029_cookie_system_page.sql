-- Migration 0029: cookie system page
--
-- Aggiunge una pagina di sistema con `system_key = 'cookie'` per ospitare
-- la cookie policy linkata dal banner pubblico, dal footer e dalla
-- nuova sezione admin /admin/compliance/cookies.
--
-- Idempotente: la WHERE NOT EXISTS evita duplicati su rieseguzione.
--
-- Stato iniziale: 'draft'. L'admin DEVE aprire la pagina in
-- /admin/content/pages, completare il testo e pubblicarla prima di
-- abilitare il banner (altrimenti il link "Maggiori informazioni"
-- punterebbe a una rotta che ritorna 404, dato che app/(cms)/[...slug]
-- serve solo le pagine con status='published').

INSERT INTO "pages" (
  "slug",
  "title",
  "content",
  "status",
  "is_system",
  "system_key",
  "page_type",
  "content_version"
)
SELECT
  'cookie-policy',
  'Cookie Policy',
  '<h1>Cookie Policy</h1><p><em>Questa pagina è un placeholder. Aggiorna il testo dalla sezione Pages e pubblicala prima di abilitare il banner.</em></p>',
  'draft',
  TRUE,
  'cookie',
  'page',
  '1-2026-05'
WHERE NOT EXISTS (
  SELECT 1 FROM "pages" WHERE "system_key" = 'cookie'
);
