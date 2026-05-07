-- Migration: 0041_cookie_registry.sql
-- Sposta il catalogo cookie da `lib/cookie-consent/services.ts` (statico,
-- IT-only) a tre tabelle DB editabili dall'admin via /admin/compliance/cookies.
--
-- - cookie_categories: 4 righe seed (le 4 categorie ePrivacy fisse,
--   `is_system=true`). Le label/description vengono dai messaggi i18n
--   statici (`messages/{en,it}/public.json` namespace
--   public.cookieModal.categories.*) per le 4 system; le custom future
--   andrebbero in i18n separatamente.
-- - cookie_services: catalogo CRUD dei tracker. 4 row seed dei servizi
--   già presenti nel codice (session/csrf/cookie_consent/vercel_analytics)
--   marcati `is_system=true` → toggle sì, delete no.
-- - cookie_service_translations: nome+descrizione per locale. Seed IT+EN
--   per i 4 servizi system.
--
-- Eseguire nel SQL Editor di Supabase. Idempotente via IF NOT EXISTS +
-- ON CONFLICT DO NOTHING.

-- ── Categorie ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cookie_categories (
  id          varchar(50)  PRIMARY KEY,
  always_on   boolean      NOT NULL DEFAULT false,
  sort_order  integer      NOT NULL DEFAULT 0,
  is_system   boolean      NOT NULL DEFAULT false,
  created_at  timestamp    NOT NULL DEFAULT now()
);

INSERT INTO cookie_categories (id, always_on, sort_order, is_system) VALUES
  ('cookie_necessary',    true,  10, true),
  ('cookie_preferences',  false, 20, true),
  ('cookie_analytics',    false, 30, true),
  ('cookie_marketing',    false, 40, true)
ON CONFLICT (id) DO NOTHING;

-- ── Servizi ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cookie_services (
  id                   varchar(100) PRIMARY KEY,
  category_id          varchar(50)  NOT NULL REFERENCES cookie_categories(id) ON DELETE RESTRICT,
  enabled              boolean      NOT NULL DEFAULT true,
  first_party          boolean      NOT NULL DEFAULT false,
  provider             varchar(200),
  provider_policy_url  text,
  is_system            boolean      NOT NULL DEFAULT false,
  sort_order           integer      NOT NULL DEFAULT 0,
  created_at           timestamp    NOT NULL DEFAULT now(),
  updated_at           timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cookie_services_category
  ON cookie_services (category_id, enabled, sort_order);

-- Seed dei 4 servizi system esistenti nel codice statico.
INSERT INTO cookie_services (id, category_id, enabled, first_party, provider, provider_policy_url, is_system, sort_order) VALUES
  ('session',          'cookie_necessary', true, true,  NULL,         NULL,                                       true, 10),
  ('csrf',             'cookie_necessary', true, true,  NULL,         NULL,                                       true, 20),
  ('cookie_consent',   'cookie_necessary', true, true,  NULL,         NULL,                                       true, 30),
  ('vercel_analytics', 'cookie_analytics', true, false, 'Vercel Inc.', 'https://vercel.com/legal/privacy-policy', true, 10)
ON CONFLICT (id) DO NOTHING;

-- ── Traduzioni servizi (nome + description per locale) ───────────────────────
CREATE TABLE IF NOT EXISTS cookie_service_translations (
  service_id   varchar(100) NOT NULL REFERENCES cookie_services(id) ON DELETE CASCADE,
  locale       varchar(5)   NOT NULL,
  name         varchar(200) NOT NULL,
  description  text         NOT NULL,
  updated_at   timestamp    NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, locale)
);

-- Seed traduzioni IT (default Gencry) per i 4 system services.
INSERT INTO cookie_service_translations (service_id, locale, name, description) VALUES
  ('session',          'it', 'Sessione utente',
    'Cookie HttpOnly che mantiene autenticato l''utente loggato. Senza, ogni richiesta richiederebbe un nuovo login.'),
  ('csrf',             'it', 'Protezione CSRF',
    'Token anti-forgery per le form e le server actions. Tutela da attacchi cross-site.'),
  ('cookie_consent',   'it', 'Stato consenso cookie',
    'Cookie HttpOnly che memorizza la scelta dell''utente sul banner per non chiederla ad ogni visita.'),
  ('vercel_analytics', 'it', 'Vercel Analytics',
    'Conteggio anonimo dei page-view e metriche di performance lato edge. Nessun PII esfiltrato. Lo script viene caricato solo dopo l''opt-in dell''utente.')
ON CONFLICT (service_id, locale) DO NOTHING;

-- Seed traduzioni EN.
INSERT INTO cookie_service_translations (service_id, locale, name, description) VALUES
  ('session',          'en', 'User session',
    'HttpOnly cookie that keeps the logged-in user authenticated. Without it, every request would need a new login.'),
  ('csrf',             'en', 'CSRF protection',
    'Anti-forgery token for forms and server actions. Prevents cross-site attacks.'),
  ('cookie_consent',   'en', 'Cookie consent state',
    'HttpOnly cookie that stores the user''s banner choice so it isn''t shown again at every visit.'),
  ('vercel_analytics', 'en', 'Vercel Analytics',
    'Anonymous page-view counting and edge performance metrics. No PII collected. The script loads only after user opt-in.')
ON CONFLICT (service_id, locale) DO NOTHING;
