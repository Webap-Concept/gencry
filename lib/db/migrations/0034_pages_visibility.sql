-- 0034_pages_visibility.sql
-- Aggiunge la colonna `visibility` (public/private) alla tabella `pages` e
-- migra i record da `route_registry` come system pages "meta-only".
--
-- Dopo questa migration `proxy.ts` legge la lista di route public/private
-- direttamente dalla tabella `pages` invece che da `route_registry`. La
-- tabella `route_registry` resta in DB ma non viene più consultata —
-- verrà droppata in una migration successiva, dopo che il cutover regge
-- in produzione (safety: se serve un rollback rapido il rollback dello
-- schema è sufficiente, niente perdita di dati).
--
-- Modello del cutover:
--   - user CMS pages → visibility default 'public' (pass-through come oggi)
--   - editorial routes (route_registry !isSystemRoute) → seedate qui con
--     la loro visibility originale, isSystem=true, contentEditable=false
--   - system pages già esistenti (auth, home, admin) → updatedate solo il
--     campo visibility per allinearle al record route_registry corrispondente

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';

-- Importa o aggiorna i record da route_registry. Lo slug deriva dal
-- pathname togliendo il leading "/". Per la home ("/" → slug ""), il
-- record è già in pages dalla 0033: ON CONFLICT aggiorna solo la
-- visibility, lascia title/content invariati.
INSERT INTO pages (
  slug,
  title,
  content,
  status,
  is_system,
  system_key,
  content_editable,
  content_version,
  page_type,
  visibility
)
SELECT
  TRIM(LEADING '/' FROM rr.pathname) AS slug,
  rr.label AS title,
  '' AS content,
  'published' AS status,
  TRUE AS is_system,
  NULL AS system_key,
  FALSE AS content_editable,
  '1-2026-05' AS content_version,
  'page' AS page_type,
  rr.visibility AS visibility
FROM route_registry rr
WHERE rr.is_active = TRUE
ON CONFLICT (slug) DO UPDATE
  SET visibility = EXCLUDED.visibility;
