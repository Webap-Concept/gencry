-- =============================================================================
-- Module: News — 002 CMS template seed
-- =============================================================================
-- Crea il template CMS "news" usato dalle pagine articolo pubblicate dal
-- modulo News. Le pagine generate hanno page_type='news' (filtro per listing
-- /news handcrafted) + templateId che punta a questo template.
--
-- Custom fields del template:
--   - hero_image   → tipo "image", MediaPickerField (R2 bucket storage,
--                    prefix news/<id>.<ext> caricato dall'admin in review)
--   - excerpt      → tipo "textarea", riassunto breve per listing card + OG
--                    description (~ 160 char). Riempito dal LLM, editabile.
--
-- NB: nessun campo source_url / source_name / original_published_at — scelta
-- editoriale: gli articoli pubblicati non hanno attribuzione visibile alla
-- fonte (i dati restano in news_items per audit interno).
--
-- is_system=true → il template non può essere cancellato dall'admin UI;
-- è gestito dal modulo. Se in futuro vogliamo togliere il modulo, l'uninstall
-- migration (M_news_999_uninstall.sql) lo droppa.
--
-- Idempotente. Da incollare nel Supabase SQL Editor DOPO M_news_001_init.
-- =============================================================================

-- ── 1) Template CMS "news" ────────────────────────────────────────────────
INSERT INTO "page_templates" ("name", "slug", "description", "is_system", "rules")
VALUES (
  'News article',
  'news',
  'Curated news article published by the News module. Used for pages with page_type=''news''. Body comes from the Tiptap editor (rich HTML), hero image and excerpt are custom fields.',
  true,
  '{}'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system"   = EXCLUDED."is_system",
  "updated_at"  = NOW();

-- ── 2) Custom fields del template ─────────────────────────────────────────
-- Lookup id del template appena upsertato + guard "non duplicare".
-- template_fields non ha un UNIQUE su (template_id, field_key), per cui
-- usiamo WHERE NOT EXISTS al posto di ON CONFLICT.
DO $$
DECLARE
  v_template_id integer;
BEGIN
  SELECT id INTO v_template_id FROM page_templates WHERE slug = 'news';

  -- hero_image (image field) — l'admin la carica via MediaPicker durante review.
  -- required=false a livello template (validazione enforced in publishNewsItem
  -- server action). Permette pagine create a mano dall'admin senza hero.
  INSERT INTO "template_fields" (
    "template_id", "field_key", "field_type", "label", "placeholder",
    "required", "sort_order"
  )
  SELECT v_template_id, 'hero_image', 'image', 'Hero image',
         'Upload a dedicated hero for this article', false, 10
  WHERE NOT EXISTS (
    SELECT 1 FROM "template_fields"
    WHERE "template_id" = v_template_id AND "field_key" = 'hero_image'
  );

  -- excerpt (textarea) — riassunto per listing + SEO meta description.
  INSERT INTO "template_fields" (
    "template_id", "field_key", "field_type", "label", "placeholder",
    "required", "sort_order"
  )
  SELECT v_template_id, 'excerpt', 'textarea',
         'Excerpt (listing card + SEO description)',
         'Two-three sentences shown in the /news listing and used as og:description',
         false, 20
  WHERE NOT EXISTS (
    SELECT 1 FROM "template_fields"
    WHERE "template_id" = v_template_id AND "field_key" = 'excerpt'
  );
END $$;
