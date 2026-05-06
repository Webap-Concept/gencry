-- Migration: 0039_seo_page_translations.sql
-- Aggiunge la tabella `seo_page_translations` per overlay locale-aware
-- dei meta SEO testuali (title, description, og_title, og_description).
--
-- Solo i 4 campi testuali sono qui: og_image resta condiviso da seo_pages
-- (immagini sociali sono universali), robots/json_ld sono direttive
-- tecniche non localizzabili.
--
-- FK su seo_pages.pathname con ON UPDATE CASCADE: se l'admin rinomina
-- il pathname (es. cambio slug della pagina), il rename si propaga
-- automaticamente alle traduzioni — niente orfani.
--
-- Eseguire nel SQL Editor di Supabase (idempotente via IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS seo_page_translations (
  pathname    varchar(255) NOT NULL,
  locale      varchar(5)   NOT NULL,
  title       varchar(70),
  description varchar(160),
  og_title    varchar(70),
  og_description varchar(200),
  updated_at  timestamp DEFAULT now(),
  PRIMARY KEY (pathname, locale),
  FOREIGN KEY (pathname) REFERENCES seo_pages(pathname)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- Index dedicato non serve: la PK (pathname, locale) copre già il
-- pattern di lookup principale `WHERE pathname=? AND locale=?` e il
-- prefix scan `WHERE pathname=?` per il caricamento di tutte le
-- traduzioni di una singola pagina nel SEO form admin.
