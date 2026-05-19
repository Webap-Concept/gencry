-- =============================================================================
-- Module: News — 006 add `category` custom field to news template
-- =============================================================================
-- Permette agli articoli creati a mano dall'editor pages (template "news")
-- di scegliere una categoria. Per gli articoli generati dal modulo, la
-- categoria viene già scritta dal LLM (news_items.category) e snapshottata
-- nei customFields al publish.
--
-- Il campo è text libero (non un enum) per evitare di toccare l'admin UI
-- dei templates. L'hint elenca i valori ammessi. Lato URL, prefix mapping
-- in CATEGORY_URL_PREFIX di lib/modules/news/publish.ts.
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

DO $$
DECLARE
  v_template_id integer;
BEGIN
  SELECT id INTO v_template_id FROM page_templates WHERE slug = 'news';
  IF v_template_id IS NULL THEN
    RAISE NOTICE 'Template "news" non trovato — saltato seed di category';
    RETURN;
  END IF;

  INSERT INTO "template_fields" (
    "template_id", "field_key", "field_type", "label", "placeholder",
    "required", "sort_order"
  )
  SELECT
    v_template_id,
    'category',
    'text',
    'Categoria',
    'bitcoin | ethereum | altcoin | defi | regulation | market | tech | other',
    false,
    5
  WHERE NOT EXISTS (
    SELECT 1 FROM "template_fields"
    WHERE "template_id" = v_template_id AND "field_key" = 'category'
  );
END $$;
