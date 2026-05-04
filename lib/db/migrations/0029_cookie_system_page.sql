-- Migration 0029: cookie system page
--
-- Aggiunge una pagina di sistema con `system_key = 'cookie'` per ospitare
-- la cookie policy linkata dal banner pubblico e dalla nuova sezione
-- admin /admin/compliance/cookies. Allineata alle altre 3 system pages
-- (terms, privacy, marketing) come pattern.
--
-- Idempotente: usa ON CONFLICT su system_key e su slug così rieseguire la
-- migration su un DB che ha già la pagina non rompe nulla.
--
-- Contenuto: placeholder minimale in italiano. L'admin dovrà aprire la
-- pagina in /admin/content/pages e completarla con il testo reale prima
-- di abilitare il banner per traffico EU.

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
  '<h1>Cookie Policy</h1><p><em>Questa pagina è un placeholder. Aggiorna il testo prima di pubblicarla.</em></p>',
  'draft',
  TRUE,
  'cookie',
  'page',
  '1-2026-05'
WHERE NOT EXISTS (
  SELECT 1 FROM "pages" WHERE "system_key" = 'cookie'
);
