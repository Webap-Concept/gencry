-- 0036_i18n_init.sql
-- Schema multilingua del core white-label.
--
-- Aggiunge:
--   1. app_locales         — registro dei locale supportati + flag is_default
--   2. translations        — contenuti dinamici per chiave (NON UI statici)
--   3. users.locale        — preferenza individuale dell'utente
--   4. page_translations   — sister table di `pages` per CMS multilocale
--
-- NB: la fonte canonica del default locale resta la env var
-- `I18N_DEFAULT_LOCALE` (letta da proxy.ts e dal loader next-intl).
-- Il flag `is_default` in `app_locales` serve solo a UI/seed/admin display
-- ed è inizialmente settato sulla row che matcha la env corrente.
--
-- Idempotente — eseguibile più volte senza effetti collaterali.

-- ---------------------------------------------------------------------------
-- 1. app_locales — locale registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_locales (
  code         VARCHAR(5)  PRIMARY KEY,
  label        VARCHAR(64) NOT NULL,
  native_label VARCHAR(64) NOT NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  is_default   BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMP   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP   NOT NULL DEFAULT now()
);

-- Solo una row può essere `is_default = true`. Partial unique index su
-- valore costante: qualunque due row entrambe true collidono sul valore 1.
CREATE UNIQUE INDEX IF NOT EXISTS app_locales_only_one_default
  ON app_locales ((1)) WHERE is_default = TRUE;

-- Seed iniziale con i due locale supportati. `is_default = TRUE` solo per
-- 'it' (Gencry-prod). Per i white-label customer che vogliono un default
-- diverso: dopo aver settato I18N_DEFAULT_LOCALE nell'env, eseguire:
--   UPDATE app_locales SET is_default = (code = '<env-value>');
-- L'admin /admin/settings/languages mostra un warning se env↔DB divergono.
INSERT INTO app_locales (code, label, native_label, sort_order, is_default)
VALUES
  ('it', 'Italian',  'Italiano', 0, TRUE),
  ('en', 'English',  'English',  1, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. translations — contenuti dinamici (email body, legal pages, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS translations (
  id         BIGSERIAL    PRIMARY KEY,
  locale     VARCHAR(5)   NOT NULL REFERENCES app_locales(code) ON DELETE CASCADE,
  namespace  VARCHAR(64)  NOT NULL,
  key        VARCHAR(255) NOT NULL,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT now(),
  CONSTRAINT translations_locale_ns_key_uq UNIQUE (locale, namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_translations_locale_ns
  ON translations (locale, namespace);

-- ---------------------------------------------------------------------------
-- 3. users.locale — preferenza individuale (sovrascrive cookie/Accept-Language
-- per le zone non-prefix: admin, settings, profilo)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale VARCHAR(5);

-- ---------------------------------------------------------------------------
-- 4. page_translations — sister table di `pages` per CMS multilocale
-- ---------------------------------------------------------------------------
-- La pagina canonica vive in `pages` (slug + content nel default locale).
-- Le altre lingue stanno qui come overlay per (page_id, locale). Lo slug
-- non cambia per locale: il prefix locale dell'URL determina la query
-- (`getPageWithTemplate(slug, locale)`).
--
-- Il content_version è preso dal `pages.content_version` corrente al
-- momento dello snapshot — utile per `page_versions` (consensi GDPR) che
-- continua a snapshottare la versione DEFAULT, ma in PR-6 sarà esteso
-- per snapshottare per locale dove serve.
CREATE TABLE IF NOT EXISTS page_translations (
  id              INTEGER      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  page_id         INTEGER      NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  locale          VARCHAR(5)   NOT NULL REFERENCES app_locales(code) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  content         TEXT         NOT NULL DEFAULT '',
  content_version VARCHAR(20),
  created_at      TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT now(),
  CONSTRAINT page_translations_page_locale_uq UNIQUE (page_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_page_translations_page
  ON page_translations (page_id);
