-- 0032_system_pages_auth.sql
-- Aggiunge il flag `content_editable` alla tabella `pages` e seeds le 5
-- system pages per le rotte auth hardcoded (sign-in, sign-up, ecc.).
--
-- Queste rotte sono servite da page handler Next.js dedicati in
-- app/(login)/<slug>/page.tsx — la system page in `pages` esiste solo
-- come container amministrativo: dà all'admin un punto unico in
-- /admin/content/pages tab Sistema per editare titolo (lista) + meta SEO
-- (tab SEO che scrive su seo_pages where pathname='/<slug>').
--
-- `[...slug]/page.tsx` chiama notFound() su qualsiasi system page con
-- content_editable=false, così digitando /sign-in non viene servita
-- la system page CMS — la rotta vera resta su (login)/sign-in/page.tsx.

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS content_editable BOOLEAN NOT NULL DEFAULT TRUE;

-- Seed delle 5 auth system pages. content vuoto, status published così
-- l'admin ne vede subito i meta in lista.
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
  ('sign-in',          'Accesso',                 '', 'published', TRUE, 'sign_in',          FALSE, '1-2026-05', 'page'),
  ('sign-up',          'Registrazione',           '', 'published', TRUE, 'sign_up',          FALSE, '1-2026-05', 'page'),
  ('verify-email',     'Verifica email',          '', 'published', TRUE, 'verify_email',     FALSE, '1-2026-05', 'page'),
  ('forgot-password',  'Password dimenticata',    '', 'published', TRUE, 'forgot_password',  FALSE, '1-2026-05', 'page'),
  ('reset-password',   'Reimposta password',      '', 'published', TRUE, 'reset_password',   FALSE, '1-2026-05', 'page')
ON CONFLICT (slug) DO NOTHING;
