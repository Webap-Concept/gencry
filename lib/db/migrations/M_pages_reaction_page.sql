-- M_pages_reaction_page.sql
--
-- Pagina di sistema /reazioni-post + template dedicato "reaction".
--
-- Mirror di /privacy: is_system=TRUE + content_editable=TRUE.
--   - content_editable=TRUE è OBBLIGATORIO per renderizzare: in cms-page.tsx
--     il 404 "meta-only" scatta solo con (is_system && !content_editable).
--   - is_system=TRUE → pagina di sistema: NON eliminabile + slug bloccato
--     nell'admin (a differenza di /news che è is_system=FALSE e cancellabile).
--
-- Il template "reaction" è CODED (app/(cms)/_templates/TemplateReaction.tsx,
-- ignora il content) e ha rules slugLocked+contentLocked → in admin si
-- editano SOLO titolo + SEO, niente content/slug/template ("editabile SEO
-- ma non altro").
--
-- Idempotente (WHERE NOT EXISTS). Da incollare nel SQL Editor di Supabase.

-- 1) Template dedicato (coded)
INSERT INTO "page_templates" ("name", "slug", "description", "rules", "is_system")
SELECT
  'Reaction',
  'reaction',
  'Pagina di sistema che spiega il sistema di reazioni del social. Template coded: niente content rich-text né custom field, solo titolo + SEO gestibili dall''admin.',
  '{"slugLocked": true, "contentLocked": true}',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM "page_templates" WHERE "slug" = 'reaction');

-- 2) Pagina di sistema collegata al template
INSERT INTO "pages" (
  "slug", "title", "content", "status",
  "template_id", "is_system", "content_editable",
  "visibility", "published_at", "content_version"
)
SELECT
  'reazioni-post',
  'Reazioni',
  '',
  'published',
  t."id",
  TRUE,
  TRUE,
  'public',
  now(),
  '1-2026-06'
FROM "page_templates" t
WHERE t."slug" = 'reaction'
  AND NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'reazioni-post');
