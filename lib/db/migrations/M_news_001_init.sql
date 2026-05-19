-- =============================================================================
-- Module: News (curated content) — 001 init
-- =============================================================================
-- Modulo "news": pipeline automatizzata di ingestion → rewrite IT con LLM →
-- review admin → publishing come pagina CMS (page_type='news'). 1-2 articoli/
-- giorno schedulati, hero image caricata manualmente dall'admin durante review.
--
-- Schema:
--   - news_sources: feed RSS/Atom da cui lo scraper preleva (admin-editable).
--   - news_items: append-only history degli articoli scraper-ati. Stati:
--       pending_rewrite → review → scheduled → published
--                                ↘ rejected
--       failed (errore irrecuperabile rewrite)
--
-- Decisioni tecniche notevoli:
--   - ID = UUID v7 (riusa `uuid_generate_v7()` seedato da M_posts_001).
--   - `original_hash` UNIQUE per dedup cross-source (sha256(url|title)).
--   - `source_*` campi salvati per audit interno + dedup. MAI esposti al
--     pubblico (vedi precisazione editoriale: niente attribuzione fonte).
--   - `published_page_id` punta a `pages.id` quando l'articolo viene
--     pubblicato come page CMS. ON DELETE SET NULL: se l'admin cancella
--     la page CMS, l'item resta nello storico ma "scollegato".
--   - `hero_asset_id` → `media_assets.id` (R2 dedicato bucket `storage`,
--     prefix `news/`). NOT NULL imposto dall'app, non dal DB (validazione
--     server-side in publish action; permette draft senza hero in queue).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 0) Funzione uuid_generate_v7() — già seedata da M_posts_001 ──────────
-- Se per qualche motivo questo modulo è installato senza posts, scommenta:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto"; (la funzione richiede pgcrypto)

-- ── 1) Tabella `news_sources` ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "news_sources" (
  "id"               uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "name"             varchar(100)  NOT NULL,
  "feed_url"         text          NOT NULL,
  -- 'rss' | 'atom' — discriminator del parser. UI admin lo lascia scegliere.
  "feed_type"        varchar(16)   NOT NULL DEFAULT 'rss',
  -- Attivo: il cron ingestion processa solo le sources active=true.
  "active"           boolean       NOT NULL DEFAULT true,
  -- Peso per future euristiche di scheduling/ranking (1-10). Default 1.
  "weight"           integer       NOT NULL DEFAULT 1,
  -- HTTP cache hints: il parser invia If-None-Match / If-Modified-Since.
  "last_fetched_at"  timestamptz,
  "last_etag"        text,
  "last_modified"    text,
  -- Diagnostica errori: l'admin vede source rotte nella lista.
  "error_count"      integer       NOT NULL DEFAULT 0,
  "last_error"       text,
  "last_error_at"    timestamptz,
  "created_at"       timestamptz   NOT NULL DEFAULT NOW(),
  "updated_at"       timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "news_sources_feed_type_chk"
    CHECK ("feed_type" IN ('rss', 'atom')),
  CONSTRAINT "news_sources_weight_chk"
    CHECK ("weight" BETWEEN 1 AND 10)
);

-- URL unico per evitare duplicate sources accidentali nella UI admin.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_news_sources_feed_url"
  ON "news_sources" (LOWER("feed_url"));

-- ── 2) Tabella `news_items` ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "news_items" (
  "id"                       uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "source_id"                uuid          REFERENCES "news_sources"("id") ON DELETE SET NULL,
  -- Source snapshot — audit interno, NON pubblicato.
  "source_url"               text          NOT NULL,
  "source_title"             text          NOT NULL,
  "source_excerpt"           text,
  "source_published_at"      timestamptz,
  -- Dedup: sha256(LOWER(source_url) || '|' || LOWER(source_title)).
  -- UNIQUE → seconda volta che lo scraper trova lo stesso item viene rejected
  -- a livello DB (INSERT ON CONFLICT DO NOTHING).
  "original_hash"            varchar(64)   NOT NULL UNIQUE,
  -- LLM output: popolati da pending_rewrite → review.
  "generated_title_it"       text,
  "generated_body_it_md"     text,
  "generated_excerpt_it"     text,
  -- Categoria opzionale (riempita dall'LLM in JSON output o impostata dall'admin).
  -- Stringa libera in v1 (es. 'bitcoin', 'ethereum', 'regulation', 'defi').
  "category"                 varchar(40),
  -- Hero image: media_assets row, bucket R2 `storage`, prefix `news/`.
  -- L'admin la carica DURANTE il review (mai dal source). NULL fino a quel
  -- momento; publish action rifiuta items senza hero.
  "hero_asset_id"            integer       REFERENCES "media_assets"("id") ON DELETE SET NULL,
  -- Stato: state machine documentata nel commento header.
  "status"                   varchar(20)   NOT NULL DEFAULT 'pending_rewrite',
  -- Scheduling: il cron publisher pubblica gli scheduled con
  -- scheduled_publish_at <= NOW().
  "scheduled_publish_at"     timestamptz,
  "published_at"             timestamptz,
  -- Bridge CMS: quando l'item viene pubblicato, link alla page CMS generata.
  -- ON DELETE SET NULL: cancellando la page, l'item resta storico orfano.
  "published_page_id"        integer       REFERENCES "pages"("id") ON DELETE SET NULL,
  -- Review trail
  "reviewed_by"              uuid          REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at"              timestamptz,
  "rejected_reason"          text,
  "edits_count"              integer       NOT NULL DEFAULT 0,
  -- AI cost tracking (capacity profile + admin overview).
  "ai_model"                 varchar(60),
  "ai_prompt_version"        varchar(20),
  "ai_cost_cents"            integer       NOT NULL DEFAULT 0,
  "ai_attempt_count"         integer       NOT NULL DEFAULT 0,
  "ai_last_error"            text,
  "created_at"               timestamptz   NOT NULL DEFAULT NOW(),
  "updated_at"               timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "news_items_status_chk"
    CHECK ("status" IN (
      'pending_rewrite', 'review', 'scheduled', 'published', 'rejected', 'failed'
    ))
);

-- ── 3) Indici ─────────────────────────────────────────────────────────────
-- Admin queue: lista per stato + ordinamento recency.
CREATE INDEX IF NOT EXISTS "idx_news_items_status_created"
  ON "news_items" ("status", "created_at" DESC);

-- Per filtrare items di una sources nella UI sources.
CREATE INDEX IF NOT EXISTS "idx_news_items_source"
  ON "news_items" ("source_id", "created_at" DESC);

-- Cron publisher: lookup degli scheduled con due. Partial → solo le righe
-- effettivamente scheduled, indice piccolissimo.
CREATE INDEX IF NOT EXISTS "idx_news_items_scheduled_due"
  ON "news_items" ("scheduled_publish_at")
  WHERE "status" = 'scheduled';

-- Cron rewriter: pickup degli items pending_rewrite più vecchi prima.
CREATE INDEX IF NOT EXISTS "idx_news_items_pending_rewrite"
  ON "news_items" ("created_at")
  WHERE "status" = 'pending_rewrite';

-- Listing pubblico (page_type=news) usa pages.published_at; nessun indice qui.

-- ── 4) Trigger updated_at ─────────────────────────────────────────────────
-- Convenzione: ogni UPDATE bumpa updated_at automaticamente.
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS news_sources_set_updated_at ON news_sources;
CREATE TRIGGER news_sources_set_updated_at
  BEFORE UPDATE ON news_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS news_items_set_updated_at ON news_items;
CREATE TRIGGER news_items_set_updated_at
  BEFORE UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
