-- 0033_system_pages_home_admin.sql
-- Estende il seed delle system pages "meta-only" iniziato dalla 0032
-- aggiungendo 3 rotte rimaste fuori dalla prima ondata:
--   - /              → home pubblica (slug vuoto)
--   - /admin         → landing del pannello admin
--   - /admin/sign-in → login admin (lib/routes.ts ADMIN_SIGNIN_ROUTE)
--
-- Il pattern è identico alle 5 auth pages della 0032: container
-- amministrativo per gestire titolo + meta SEO da /admin/content/pages
-- tab Sistema. Le rotte vere restano servite dai loro page handler
-- Next.js dedicati — la system page CMS non viene mai resa al posto
-- della rotta reale.

INSERT INTO pages (
  slug,
  title,
  content,
  status,
  is_system,
  system_key,
  content_editable,
  content_version,
  page_type
)
VALUES
  -- slug vuoto = pathname '/' (home). Il filtro in /admin/seo/meta-tags
  -- usa `/${p.slug}` per derivare il pathname, che diventa '/'.
  ('',                'Home Page',         '', 'published', TRUE, 'home',           FALSE, '1-2026-05', 'page'),
  ('admin',           'Admin',             '', 'published', TRUE, 'admin_home',     FALSE, '1-2026-05', 'page'),
  ('admin/sign-in',   'Admin · Accesso',   '', 'published', TRUE, 'admin_sign_in',  FALSE, '1-2026-05', 'page')
ON CONFLICT (slug) DO NOTHING;
