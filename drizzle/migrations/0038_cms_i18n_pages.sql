-- Migration: 0038_cms_i18n_pages.sql
-- Aggiunge:
--   1. page_translations.slug          (slug per-locale, unico per (locale, slug))
--   2. page_translations.title         → diventa nullable (supporta traduzioni parziali)
--   3. page_translations.content       → diventa nullable (idem)
--   4. redirects.source                (manual | auto_slug)
--   5. redirects.page_id               (FK → pages, SET NULL on delete)
--   6. redirects.locale                (locale del redirect auto_slug)
--
-- Eseguire nel SQL Editor di Supabase (una volta sola, idempotente via IF NOT EXISTS).

-- ─── page_translations ────────────────────────────────────────────────────────

-- 1. Rendi title nullable (supporta traduzioni con solo slug o solo content)
ALTER TABLE page_translations
  ALTER COLUMN title DROP NOT NULL;

-- 2. Rendi content nullable
ALTER TABLE page_translations
  ALTER COLUMN content DROP NOT NULL;

-- 3. Aggiungi colonna slug (per-locale URL segment)
ALTER TABLE page_translations
  ADD COLUMN IF NOT EXISTS slug varchar(255);

-- 4. Unique index (locale, slug) — parziale: solo dove slug IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS page_translations_locale_slug_uq
  ON page_translations (locale, slug)
  WHERE slug IS NOT NULL;

-- ─── redirects ────────────────────────────────────────────────────────────────

-- 5. Colonna source: 'manual' | 'auto_slug'
ALTER TABLE redirects
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'manual';

-- 6. Colonna page_id: FK verso pages (SET NULL se la pagina viene eliminata)
ALTER TABLE redirects
  ADD COLUMN IF NOT EXISTS page_id integer REFERENCES pages(id) ON DELETE SET NULL;

-- 7. Colonna locale: NULL = default locale
ALTER TABLE redirects
  ADD COLUMN IF NOT EXISTS locale varchar(5);

-- 8. Index su page_id (per query admin "redirect di questa pagina")
CREATE INDEX IF NOT EXISTS idx_redirects_page_id
  ON redirects (page_id)
  WHERE page_id IS NOT NULL;
