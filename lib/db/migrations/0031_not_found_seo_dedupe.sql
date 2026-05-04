-- 0031_not_found_seo_dedupe.sql
-- Cleanup post-0030: la migration 0030 aveva inserito un record orfano
-- in seo_pages con pseudopath '/__404'. Lo eliminiamo per non avere
-- duplicati nel pannello /admin/seo/meta-tags.
--
-- L'unico record valido per la 404 è quello con pathname '/404':
--   - lo slug della system page in `pages` è '404'
--   - SeoManager mostra '/404' come route configurabile (deriva da
--     pages.slug)
--   - app/not-found.tsx ora legge i meta da getSeoPage('/404')
--
-- Garantiamo che la riga '/404' esista (UPSERT) con i meta default.
-- Se l'admin l'ha già configurata manualmente, le sue modifiche
-- vincono — l'ON CONFLICT è no-op.

DELETE FROM seo_pages WHERE pathname = '/__404';

INSERT INTO seo_pages (
  pathname,
  label,
  title,
  description,
  robots
)
VALUES (
  '/404',
  '404 — Pagina non trovata',
  '404 — Pagina non trovata',
  E'L''asset che cercavi non è in portafoglio.',
  'noindex, follow'
)
ON CONFLICT (pathname) DO NOTHING;
