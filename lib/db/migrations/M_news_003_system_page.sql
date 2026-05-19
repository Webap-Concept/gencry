-- =============================================================================
-- Module: News — 003 system page (/news listing — meta-only)
-- =============================================================================
-- Aggiunge la pagina di sistema `news` al CMS. La rotta `/news` è servita dal
-- page handler dedicato (app/(frontend)/news/page.tsx) che renderizza la grid
-- automatica degli articoli pubblicati — la system page in `pages` serve solo
-- da container amministrativo per editare titolo + meta SEO da
-- /admin/content/pages.
--
-- Stesso pattern di 0033_system_pages_home_admin.sql per home / admin_home /
-- admin_sign_in: is_system=true + content_editable=false → l'editor admin
-- mostra solo i campi SEO, niente content/template/custom fields.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 1) System page row ────────────────────────────────────────────────────
INSERT INTO pages (
  slug,
  title,
  content,
  status,
  is_system,
  system_key,
  content_editable,
  visibility,
  content_version,
  page_type
)
VALUES (
  'news',
  'News',
  '',
  'published',
  TRUE,
  'news',
  FALSE,
  'public',
  '1-2026-05',
  'page'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 2) Meta SEO predefiniti per /news ─────────────────────────────────────
-- L'admin li modifica da /admin/content/pages selezionando la system page
-- "News" (oppure direttamente da /admin/seo/meta-tags). Il page handler in
-- app/(frontend)/news/page.tsx fa già `getCachedSeoPage('/news', locale)`,
-- quindi i valori qui prendono effetto subito dopo l'esecuzione.
INSERT INTO seo_pages (
  pathname,
  label,
  title,
  description,
  og_title,
  og_description,
  robots,
  json_ld_enabled,
  json_ld_type
)
VALUES (
  '/news',
  'News — Blog',
  'News',
  'Notizie e analisi crypto curate dalla redazione di GenerazioneCrypto.',
  'News',
  'Notizie e analisi crypto curate dalla redazione di GenerazioneCrypto.',
  'index, follow',
  FALSE,
  NULL
)
ON CONFLICT (pathname) DO NOTHING;
