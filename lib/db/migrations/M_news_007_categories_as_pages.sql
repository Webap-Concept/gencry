-- =============================================================================
-- Module: News — 007 categories as CMS pages
-- =============================================================================
-- Refactor: le categorie news passano da custom field enum (news_items.category)
-- a vere page CMS gerarchiche. Modello:
--
--   /news                  (page CMS, template "news-home", parent_id NULL)
--     └─ /news/<categoria> (page CMS, template "news-category", parent=/news)
--         └─ /news/<categoria>/<slug-articolo> (template "news", parent=cat)
--
-- Articoli senza categoria (category='other' o NULL) restano figli diretti di
-- /news → slug `news/<slug>` senza segmento intermedio.
--
-- Cosa fa, in ordine:
--   1. INSERT/UPDATE template "news-home" con rules slugLocked+contentLocked.
--   2. INSERT/UPDATE template "news-category" con stesse rules.
--   3. INSERT custom field "description" (textarea opzionale) su news-category.
--   4. Set allowedChildTemplateIds: news-home → [news-category, news];
--                                   news-category → [news].
--   5. Converte la system page "news" (is_system=false, system_key=NULL,
--      content_editable=true) e la lega al template news-home.
--   6. Seeda 8 page categoria figlie di /news (slug news/<prefix>).
--   7. Reparent + slug rewrite degli articoli published.
--   8. Sanity check: 0 articoli published con parent_id NULL.
--
-- Wrappata in BEGIN/COMMIT → se un qualsiasi step fallisce, rollback totale.
-- Idempotente: rilanciabile, ON CONFLICT/IF NOT EXISTS dove serve, la UPDATE
-- slug è guardata da `slug NOT LIKE 'news/%'` quindi non doppia il prefix.
--
-- ⚠️ Destructive: la step 7 riscrive `pages.slug` degli articoli published.
-- BACKUP della tabella `pages` prima di lanciare (Supabase snapshot o
-- `pg_dump -t pages`). Da incollare nel Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- ── 1) Template "news-home" ────────────────────────────────────────────────
INSERT INTO "page_templates" ("name", "slug", "description", "is_system", "rules")
VALUES (
  'News listing',
  'news-home',
  'Home page del blog news. Renderizza la grid degli articoli pubblicati (feature story, featured grid, colonne tematiche, essays). Niente content rich-text editabile, niente custom field. Solo SEO + titolo gestibili dall''admin.',
  true,
  '{"slugLocked":true,"contentLocked":true}'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system"   = EXCLUDED."is_system",
  "rules"       = EXCLUDED."rules",
  "updated_at"  = NOW();

-- ── 2) Template "news-category" ────────────────────────────────────────────
INSERT INTO "page_templates" ("name", "slug", "description", "is_system", "rules")
VALUES (
  'News category',
  'news-category',
  'Page categoria news (es. /news/bitcoin, /news/altcoin). Listing degli articoli figli ordinati per published_at desc. Slug bloccato + content bloccato; l''admin gestisce solo titolo, descrizione opzionale e SEO.',
  true,
  '{"slugLocked":true,"contentLocked":true}'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system"   = EXCLUDED."is_system",
  "rules"       = EXCLUDED."rules",
  "updated_at"  = NOW();

-- ── 3) Custom field "description" sul template news-category ──────────────
DO $$
DECLARE
  v_template_id integer;
BEGIN
  SELECT id INTO v_template_id FROM page_templates WHERE slug = 'news-category';

  INSERT INTO "template_fields" (
    "template_id", "field_key", "field_type", "label", "placeholder",
    "required", "sort_order"
  )
  SELECT v_template_id, 'description', 'textarea',
         'Descrizione categoria',
         'Sottotitolo mostrato sotto il titolo della pagina categoria. Lasciare vuoto per nasconderlo.',
         false, 10
  WHERE NOT EXISTS (
    SELECT 1 FROM "template_fields"
    WHERE "template_id" = v_template_id AND "field_key" = 'description'
  );
END $$;

-- ── 4) allowedChildTemplateIds (gerarchia restrittiva) ────────────────────
DO $$
DECLARE
  v_news_home_id integer;
  v_news_cat_id  integer;
  v_news_art_id  integer;
BEGIN
  SELECT id INTO v_news_home_id FROM page_templates WHERE slug = 'news-home';
  SELECT id INTO v_news_cat_id  FROM page_templates WHERE slug = 'news-category';
  SELECT id INTO v_news_art_id  FROM page_templates WHERE slug = 'news';

  IF v_news_home_id IS NULL OR v_news_cat_id IS NULL OR v_news_art_id IS NULL THEN
    RAISE EXCEPTION 'Template news-home/news-category/news mancanti, abort.';
  END IF;

  -- news-home → child consentiti: news-category (per le 8 categorie) +
  -- news (per articoli "other"/NULL che cadono diretti sotto /news).
  UPDATE page_templates
  SET rules = jsonb_set(
                rules::jsonb,
                '{allowedChildTemplateIds}',
                jsonb_build_array(v_news_cat_id, v_news_art_id)
              )::text,
      updated_at = NOW()
  WHERE id = v_news_home_id;

  -- news-category → child consentiti: solo news (l'articolo).
  UPDATE page_templates
  SET rules = jsonb_set(
                rules::jsonb,
                '{allowedChildTemplateIds}',
                jsonb_build_array(v_news_art_id)
              )::text,
      updated_at = NOW()
  WHERE id = v_news_cat_id;
END $$;

-- ── 5) Promozione system page "news" → normal page con template news-home ─
DO $$
DECLARE
  v_news_home_id integer;
BEGIN
  SELECT id INTO v_news_home_id FROM page_templates WHERE slug = 'news-home';
  IF v_news_home_id IS NULL THEN
    RAISE EXCEPTION 'Template news-home non trovato, abort.';
  END IF;

  -- is_system=false + system_key=NULL + content_editable=true:
  -- la page non è più "system meta-only" → cms-page.tsx la renderizza
  -- via TemplateNewsHome invece di restituire 404. Il template ha
  -- contentLocked → l'editor admin nasconde il rich-text editor ma
  -- titolo/SEO/template restano editabili.
  UPDATE pages
  SET is_system = false,
      system_key = NULL,
      content_editable = true,
      template_id = v_news_home_id,
      updated_at = NOW()
  WHERE slug = 'news';
END $$;

-- ── 6) Seed delle 8 page categoria figlie di /news ────────────────────────
DO $$
DECLARE
  v_news_page_id     integer;
  v_news_cat_tpl_id  integer;
BEGIN
  SELECT id INTO v_news_page_id    FROM pages          WHERE slug = 'news';
  SELECT id INTO v_news_cat_tpl_id FROM page_templates WHERE slug = 'news-category';

  IF v_news_page_id IS NULL THEN
    RAISE EXCEPTION 'pages row con slug=news non trovata, abort.';
  END IF;
  IF v_news_cat_tpl_id IS NULL THEN
    RAISE EXCEPTION 'Template news-category non trovato, abort.';
  END IF;

  INSERT INTO pages (
    slug, title, content, status, published_at,
    parent_id, template_id,
    page_type, visibility, content_editable, content_version, sort_order
  )
  VALUES
    ('news/bitcoin',          'Bitcoin',          '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 10),
    ('news/ethereum',         'Ethereum',         '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 20),
    ('news/altcoin',          'Altcoin',          '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 30),
    ('news/stablecoin',       'Stablecoin',       '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 40),
    ('news/defi',             'DeFi',             '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 50),
    ('news/mercati',          'Mercati',          '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 60),
    ('news/regolamentazione', 'Regolamentazione', '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 70),
    ('news/tech',             'Tech',             '', 'published', NOW(), v_news_page_id, v_news_cat_tpl_id, 'page', 'public', true, '1-2026-05', 80)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ── 7) Reparent + slug rewrite degli articoli published ───────────────────
DO $$
DECLARE
  v_news_page_id   integer;
  v_count_to_move  integer;
  v_count_orphan   integer;
BEGIN
  SELECT id INTO v_news_page_id FROM pages WHERE slug = 'news';

  SELECT COUNT(*) INTO v_count_to_move
  FROM pages
  WHERE page_type = 'news'
    AND status = 'published'
    AND slug NOT LIKE 'news/%';

  RAISE NOTICE '[news-007] Articoli published da migrare: %', v_count_to_move;

  -- (A) Articoli con news_items match + categoria mappabile → categoria.
  -- 'market'→'mercati' e 'regulation'→'regolamentazione' (prefix IT).
  -- 'other' resta non-mappato qui (il CASE ELSE NULL fa fallire il JOIN
  -- INNER su cat → l'articolo NON viene aggiornato in A) e cade nello
  -- step B più sotto.
  UPDATE pages p
  SET parent_id = cat.id,
      slug = 'news/' || p.slug,
      updated_at = NOW()
  FROM news_items ni
  INNER JOIN pages cat
    ON cat.slug = 'news/' || (
      CASE ni.category
        WHEN 'bitcoin'    THEN 'bitcoin'
        WHEN 'ethereum'   THEN 'ethereum'
        WHEN 'altcoin'    THEN 'altcoin'
        WHEN 'stablecoin' THEN 'stablecoin'
        WHEN 'defi'       THEN 'defi'
        WHEN 'market'     THEN 'mercati'
        WHEN 'regulation' THEN 'regolamentazione'
        WHEN 'tech'       THEN 'tech'
        ELSE NULL
      END
    )
  WHERE ni.published_page_id = p.id
    AND p.page_type = 'news'
    AND p.status = 'published'
    AND p.slug NOT LIKE 'news/%';

  -- (B) Articoli rimasti: senza news_items match, oppure category='other'
  -- /NULL, oppure category non-mappabile → fallback a parent=/news (home).
  -- Slug diventa `news/<slug-originale>` (figlio diretto di /news, niente
  -- categoria intermedia).
  UPDATE pages p
  SET parent_id = v_news_page_id,
      slug = 'news/' || p.slug,
      updated_at = NOW()
  WHERE p.page_type = 'news'
    AND p.status = 'published'
    AND p.slug NOT LIKE 'news/%';

  -- ── 8) Sanity check ─────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_count_orphan
  FROM pages
  WHERE page_type = 'news'
    AND status = 'published'
    AND parent_id IS NULL;

  IF v_count_orphan > 0 THEN
    RAISE EXCEPTION '[news-007] % articoli published senza parent_id dopo la migrazione (atteso 0). Abort + rollback.', v_count_orphan;
  END IF;

  RAISE NOTICE '[news-007] Migrazione completata. Articoli published orphan: %.', v_count_orphan;
END $$;

COMMIT;
