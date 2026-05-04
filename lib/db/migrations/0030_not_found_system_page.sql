-- 0030_not_found_system_page.sql
-- Aggiunge la pagina di sistema "not_found" al CMS.
--
-- Permette all'admin di:
--   1. Vedere la 404 nel pannello /admin/content/pages tab "Sistema"
--   2. Modificare titolo + sottotitolo del Crash404 senza deploy
--   3. Modificare i meta tag della 404 da /admin/seo/meta-tags
--      (record `seo_pages` con pathname '/__404')
--
-- La systemKey è "not_found" (vedi SYSTEM_PAGE_KEYS in schema.ts).
-- Lo slug "404" è solo un placeholder usato dall'admin UI: la 404
-- non è servita da una rotta CMS, ma da app/not-found.tsx che
-- legge il record via getPageBySystemKey('not_found').

INSERT INTO pages (
  slug,
  title,
  content,
  status,
  is_system,
  system_key,
  content_version,
  page_type
)
VALUES (
  '404',
  'Pagina non trovata',
  E'L''asset che cercavi non è in portafoglio. Forse è stata rugpullata, forse l''hai scritta male — succede ai migliori. Torna alla home e riparti dai movimenti del giorno.',
  'published',
  TRUE,
  'not_found',
  '1-2026-05',
  'page'
)
ON CONFLICT (slug) DO NOTHING;

-- Meta tag SEO predefiniti per la 404 — pathname '/__404' è uno
-- pseudopath: non corrisponde a nessuna rotta servita, è solo la
-- chiave usata da app/not-found.tsx per fare il lookup dei meta.
-- L'admin può modificarli da /admin/seo/meta-tags come una qualsiasi
-- altra pagina del sistema.
INSERT INTO seo_pages (
  pathname,
  label,
  title,
  description,
  robots
)
VALUES (
  '/__404',
  '404 — Pagina non trovata',
  '404 — Pagina non trovata',
  E'L''asset che cercavi non è in portafoglio.',
  'noindex, follow'
)
ON CONFLICT (pathname) DO NOTHING;
