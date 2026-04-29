-- Migration: page_templates.style_config → page_templates.rules
-- Rimuove la "skin" grafica (font/colori/spacing) dal DB: lo stile ora vive
-- direttamente nei componenti Template{Slug}.tsx. Il JSON di config conserva
-- soltanto le regole di gerarchia (allowedChildTemplateIds), per cui la
-- colonna viene rinominata in `rules`.
--
-- Eseguire manualmente nel SQL Editor di Supabase (single transaction).

BEGIN;

-- 1. Aggiungi la nuova colonna `rules`
ALTER TABLE "page_templates"
  ADD COLUMN IF NOT EXISTS "rules" text DEFAULT '{}';

-- 2. Migra i dati: estrai allowedChildTemplateIds da style_config in rules.
--    I campi visivi (fontBody, colorPrimary, ecc.) vengono scartati.
UPDATE "page_templates"
SET "rules" = jsonb_build_object(
  'allowedChildTemplateIds',
  COALESCE(
    (("style_config"::jsonb) -> 'allowedChildTemplateIds'),
    '[]'::jsonb
  )
)::text
WHERE "style_config" IS NOT NULL
  AND "style_config" <> '';

-- 3. Per le righe con style_config NULL/vuoto, lascia il default '{}'
UPDATE "page_templates"
SET "rules" = '{}'
WHERE "rules" IS NULL;

-- 4. Drop della vecchia colonna
ALTER TABLE "page_templates"
  DROP COLUMN IF EXISTS "style_config";

COMMIT;
