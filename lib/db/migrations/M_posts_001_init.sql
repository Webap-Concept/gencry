-- =============================================================================
-- Module: Posts (social feed) — 001 init
-- =============================================================================
-- Primo modulo del social vero (decisione architetturale 2026-05-14, vedi
-- memory project_module_posts_architecture).
--
-- Schema obiettivi:
--   - 10 tabelle: posts (root), posts_media, posts_reactions, posts_comments,
--     posts_bookmarks, posts_reports, posts_tickers, posts_mentions,
--     posts_link_previews, posts_outbox
--   - Counter denormalizzati sulle row dei posts (reactions × 6, comments,
--     reposts, bookmarks). Aggiornati via service astratto in PR-2
--     (oggi trigger DB, domani write-behind queue)
--   - Indici critici per feed Discover/Following/profilo/ticker/mentions
--   - Settings `modules.posts.*` in app_settings (editabili dall'admin)
--   - Permission RBAC `modules:posts` (base) + `modules:posts.moderate` (extra)
--
-- Decisioni tecniche notevoli:
--   - ID = UUID v7 (time-ordered) via funzione PL/pgSQL custom: ORDER BY id ≈
--     ORDER BY created_at, B-tree compatto, INSERT su tail. La funzione usa
--     `gen_random_bytes` da pgcrypto.
--   - Enum modellati come varchar + CHECK (coerente col resto del codebase
--     che NON usa pgEnum, vedi onboarding_risk_profile.profile).
--   - `body_tsv` GENERATED ALWAYS + GIN parziale: predisposto per FTS in v1.5,
--     zero costo runtime extra in v1.
--   - I trigger DB per counter/outbox NON sono in questa migration: arrivano
--     in M_posts_002_triggers.sql (PR-2) insieme al service layer astratto
--     in lib/modules/posts/services/. Questo permette di tenere PR-1 puramente
--     schema (zero behavior change) e PR-2 puramente service (zero schema).
--
-- Idempotente. Da incollare nel Supabase SQL Editor.
-- =============================================================================

-- ── 0) Extension necessaria per gen_random_bytes ───────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1) Funzione uuid_generate_v7() — time-ordered UUID (RFC 9562) ─────────
--
-- Layout: 48 bit unix_ms | 12 bit rand | 4 bit version (=7) | 62 bit rand |
--         2 bit variant (=10).
--
-- Nota: Postgres 17 ha `uuidv7()` built-in. Su Postgres ≤16 (Supabase oggi)
-- usiamo questa funzione. Se in futuro Supabase ci porta a 17 possiamo
-- sostituirla con un alias a `uuidv7()` senza toccare il resto.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms BIGINT;
  uuid_bytes BYTEA;
BEGIN
  unix_ts_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  uuid_bytes := gen_random_bytes(16);
  -- 6 byte timestamp big-endian
  uuid_bytes := SET_BYTE(uuid_bytes, 0, ((unix_ts_ms >> 40) & 255)::INT);
  uuid_bytes := SET_BYTE(uuid_bytes, 1, ((unix_ts_ms >> 32) & 255)::INT);
  uuid_bytes := SET_BYTE(uuid_bytes, 2, ((unix_ts_ms >> 24) & 255)::INT);
  uuid_bytes := SET_BYTE(uuid_bytes, 3, ((unix_ts_ms >> 16) & 255)::INT);
  uuid_bytes := SET_BYTE(uuid_bytes, 4, ((unix_ts_ms >>  8) & 255)::INT);
  uuid_bytes := SET_BYTE(uuid_bytes, 5,  (unix_ts_ms        & 255)::INT);
  -- Version (high nibble byte 6 = 0111 = 0x70)
  uuid_bytes := SET_BYTE(uuid_bytes, 6, ((GET_BYTE(uuid_bytes, 6) & 15) | 112));
  -- Variant (high bits byte 8 = 10)
  uuid_bytes := SET_BYTE(uuid_bytes, 8, ((GET_BYTE(uuid_bytes, 8) & 63) | 128));
  RETURN ENCODE(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ── 2) Tabella `posts` (root) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts" (
  "id"                 uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "author_id"          uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body"               text          NOT NULL DEFAULT '',
  -- 'public' | 'members' | 'followers' | 'private' (validato via CHECK)
  "visibility"         varchar(16)   NOT NULL DEFAULT 'public',
  -- Quote repost: punta al post originale. NULL per post normale.
  "repost_of_id"       uuid          REFERENCES "posts"("id") ON DELETE SET NULL,
  "edited_at"          timestamptz,
  "deleted_at"         timestamptz,
  "created_at"         timestamptz   NOT NULL DEFAULT NOW(),
  -- ─ Counter denormalizzati (aggiornati via trigger in PR-2) ──────────────
  "reactions_like"     integer       NOT NULL DEFAULT 0,
  "reactions_rocket"   integer       NOT NULL DEFAULT 0,
  "reactions_bull"     integer       NOT NULL DEFAULT 0,
  "reactions_bear"     integer       NOT NULL DEFAULT 0,
  "reactions_dump"     integer       NOT NULL DEFAULT 0,
  "reactions_diamond"  integer       NOT NULL DEFAULT 0,
  "comments_count"     integer       NOT NULL DEFAULT 0,
  "reposts_count"      integer       NOT NULL DEFAULT 0,
  "bookmarks_count"    integer       NOT NULL DEFAULT 0,
  -- ─ Search FTS (predisposto v1.5) ────────────────────────────────────────
  "body_tsv"           tsvector      GENERATED ALWAYS AS (to_tsvector('simple', coalesce("body", ''))) STORED,
  CONSTRAINT "posts_visibility_chk"    CHECK ("visibility" IN ('public','members','followers','private')),
  CONSTRAINT "posts_body_len_chk"      CHECK (length("body") <= 5000),
  CONSTRAINT "posts_no_self_repost"    CHECK ("repost_of_id" IS NULL OR "repost_of_id" <> "id")
);

-- Feed Discover (pubblico/members) — partial index
CREATE INDEX IF NOT EXISTS "idx_posts_discover"
  ON "posts" ("created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "visibility" IN ('public','members');

-- Feed Following + Profilo
CREATE INDEX IF NOT EXISTS "idx_posts_author_timeline"
  ON "posts" ("author_id", "created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL;

-- Quote repost lookups
CREATE INDEX IF NOT EXISTS "idx_posts_repost_of"
  ON "posts" ("repost_of_id")
  WHERE "repost_of_id" IS NOT NULL;

-- Search FTS (parziale: skippa cancellati)
CREATE INDEX IF NOT EXISTS "idx_posts_body_gin"
  ON "posts" USING GIN ("body_tsv")
  WHERE "deleted_at" IS NULL;

-- ── 3) Tabella `posts_media` (immagini R2 collegate al post) ───────────────
CREATE TABLE IF NOT EXISTS "posts_media" (
  "id"            uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  -- NULL durante draft pre-publish (ticket emesso ma post non ancora creato)
  "post_id"       uuid          REFERENCES "posts"("id") ON DELETE CASCADE,
  "author_id"     uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "storage_key"   text          NOT NULL UNIQUE,
  "full_url"      text,
  "thumb_url"     text,
  "mime_type"     varchar(50)   NOT NULL,
  "width"         integer,
  "height"        integer,
  "size_bytes"    bigint        NOT NULL,
  "position"      smallint      NOT NULL DEFAULT 0,
  "confirmed_at"  timestamptz,
  "created_at"    timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "posts_media_position_chk" CHECK ("position" >= 0 AND "position" <= 9),
  CONSTRAINT "posts_media_mime_chk"     CHECK ("mime_type" IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT "posts_media_size_chk"     CHECK ("size_bytes" > 0 AND "size_bytes" <= 16777216)  -- 16MB hard cap server-side
);

CREATE INDEX IF NOT EXISTS "idx_posts_media_post"
  ON "posts_media" ("post_id", "position")
  WHERE "post_id" IS NOT NULL;

-- Orphan cleanup index (ticket emessi ma mai confermati)
CREATE INDEX IF NOT EXISTS "idx_posts_media_orphan"
  ON "posts_media" ("created_at")
  WHERE "confirmed_at" IS NULL;

-- ── 4) Tabella `posts_reactions` ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts_reactions" (
  "post_id"     uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "user_id"     uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'like' | 'rocket' | 'bull' | 'bear' | 'dump' | 'diamond'
  "reaction"    varchar(16)   NOT NULL,
  "created_at"  timestamptz   NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("post_id", "user_id", "reaction"),
  CONSTRAINT "posts_reactions_kind_chk"
    CHECK ("reaction" IN ('like','rocket','bull','bear','dump','diamond'))
);

CREATE INDEX IF NOT EXISTS "idx_posts_reactions_post_kind"
  ON "posts_reactions" ("post_id", "reaction");

CREATE INDEX IF NOT EXISTS "idx_posts_reactions_user_recent"
  ON "posts_reactions" ("user_id", "created_at" DESC);

-- ── 5) Tabella `posts_comments` ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts_comments" (
  "id"                 uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "post_id"            uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "author_id"          uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Visual grouping a 2-livelli max; lato logico/feed resta flat
  "parent_comment_id"  uuid          REFERENCES "posts_comments"("id") ON DELETE SET NULL,
  "body"               text          NOT NULL,
  "edited_at"          timestamptz,
  "deleted_at"         timestamptz,
  "created_at"         timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "posts_comments_body_len_chk" CHECK (length("body") >= 1 AND length("body") <= 2000),
  CONSTRAINT "posts_comments_no_self_parent" CHECK ("parent_comment_id" IS NULL OR "parent_comment_id" <> "id")
);

CREATE INDEX IF NOT EXISTS "idx_posts_comments_post"
  ON "posts_comments" ("post_id", "created_at")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_posts_comments_author"
  ON "posts_comments" ("author_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;

-- ── 6) Tabella `posts_bookmarks` ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts_bookmarks" (
  "user_id"     uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "post_id"     uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "created_at"  timestamptz   NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "post_id")
);

CREATE INDEX IF NOT EXISTS "idx_posts_bookmarks_user_recent"
  ON "posts_bookmarks" ("user_id", "created_at" DESC);

-- ── 7) Tabella `posts_reports` (queue moderazione) ─────────────────────────
CREATE TABLE IF NOT EXISTS "posts_reports" (
  "id"            uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "post_id"       uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "reporter_id"   uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'spam' | 'scam' | 'abuse' | 'other'
  "reason"        varchar(16)   NOT NULL,
  "details"       text,
  -- 'open' | 'reviewed' | 'dismissed' | 'actioned'
  "status"        varchar(16)   NOT NULL DEFAULT 'open',
  "reviewed_by"   uuid          REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at"   timestamptz,
  "created_at"    timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "posts_reports_reason_chk" CHECK ("reason" IN ('spam','scam','abuse','other')),
  CONSTRAINT "posts_reports_status_chk" CHECK ("status" IN ('open','reviewed','dismissed','actioned'))
);

-- Queue admin: solo report open, ordinati dal più vecchio
CREATE INDEX IF NOT EXISTS "idx_posts_reports_open"
  ON "posts_reports" ("created_at")
  WHERE "status" = 'open';

CREATE INDEX IF NOT EXISTS "idx_posts_reports_post"
  ON "posts_reports" ("post_id", "created_at" DESC);

-- ── 8) Tabella `posts_tickers` (lookup per /feed?ticker=BTC) ──────────────
CREATE TABLE IF NOT EXISTS "posts_tickers" (
  "post_id"     uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "ticker"      varchar(20)   NOT NULL,
  -- Denormalizzato dal post per servire l'index (ticker, created_at) senza JOIN
  "created_at"  timestamptz   NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("post_id", "ticker"),
  CONSTRAINT "posts_tickers_format_chk" CHECK ("ticker" ~ '^[A-Z][A-Z0-9]{1,19}$')
);

CREATE INDEX IF NOT EXISTS "idx_posts_tickers_feed"
  ON "posts_tickers" ("ticker", "created_at" DESC);

-- ── 9) Tabella `posts_mentions` (lookup per @user) ─────────────────────────
CREATE TABLE IF NOT EXISTS "posts_mentions" (
  "post_id"            uuid          NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "mentioned_user_id"  uuid          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"         timestamptz   NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("post_id", "mentioned_user_id")
);

CREATE INDEX IF NOT EXISTS "idx_posts_mentions_user"
  ON "posts_mentions" ("mentioned_user_id", "created_at" DESC);

-- ── 10) Tabella `posts_link_previews` (cache OG dedup per URL) ─────────────
CREATE TABLE IF NOT EXISTS "posts_link_previews" (
  "url"           text          PRIMARY KEY,
  "title"         text,
  "description"   text,
  "image_url"     text,
  "site_name"     text,
  -- 'ok' | 'failed' | 'pending'
  "fetch_status"  varchar(16)   NOT NULL DEFAULT 'pending',
  "fetched_at"    timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "posts_link_previews_status_chk" CHECK ("fetch_status" IN ('ok','failed','pending'))
);

-- Per il cron daily re-fetch (status='ok' AND fetched_at < now()-N days)
CREATE INDEX IF NOT EXISTS "idx_posts_link_previews_refresh"
  ON "posts_link_previews" ("fetched_at")
  WHERE "fetch_status" = 'ok';

-- ── 11) Tabella `posts_outbox` (outbox per future notifications) ───────────
-- Popolata da trigger DB (PR-2) su INSERT in posts_reactions/comments/mentions
-- e su repost. Consumata dal modulo `notifications` futuro.
CREATE TABLE IF NOT EXISTS "posts_outbox" (
  "id"            uuid          PRIMARY KEY DEFAULT uuid_generate_v7(),
  "event_type"    varchar(64)   NOT NULL,
  "payload"       jsonb         NOT NULL,
  "processed_at"  timestamptz,
  "created_at"    timestamptz   NOT NULL DEFAULT NOW()
);

-- Consumer scan: solo eventi pendenti, ordine FIFO
CREATE INDEX IF NOT EXISTS "idx_posts_outbox_pending"
  ON "posts_outbox" ("created_at")
  WHERE "processed_at" IS NULL;

-- ── 12) Settings di default (chiavi `modules.posts.*`) ────────────────────
INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  -- Composer
  ('modules.posts.max_body_length',              '2000',          NOW()),
  ('modules.posts.max_images_per_post',          '4',             NOW()),
  ('modules.posts.edit_window_minutes',          '10',            NOW()),
  -- Rate limiting (sliding window via Upstash KV)
  ('modules.posts.rate_limit_post_per_hour',     '10',            NOW()),
  ('modules.posts.rate_limit_reaction_per_min',  '60',            NOW()),
  ('modules.posts.rate_limit_comment_per_min',   '30',            NOW()),
  ('modules.posts.rate_limit_repost_per_hour',   '5',             NOW()),
  ('modules.posts.rate_limit_report_per_hour',   '5',             NOW()),
  ('modules.posts.rate_limit_media_per_hour',    '20',            NOW()),
  -- Cron / retention
  ('modules.posts.link_preview_cache_days',      '30',            NOW()),
  ('modules.posts.outbox_retention_days',        '30',            NOW()),
  ('modules.posts.orphan_media_grace_hours',     '24',            NOW()),
  -- R2 storage (bucket dedicato `social-media`, namespace credenziali)
  ('modules.posts.r2.account_id',                '',              NOW()),
  ('modules.posts.r2.access_key_id',             '',              NOW()),
  ('modules.posts.r2.secret_access_key',         '',              NOW()),
  ('modules.posts.r2.bucket',                    'social-media',  NOW()),
  ('modules.posts.r2.public_base_url',           '',              NOW())
ON CONFLICT ("key") DO NOTHING;

-- ── 13) Permission RBAC ───────────────────────────────────────────────────
INSERT INTO "permissions" ("key", "label", "group", "is_system") VALUES
  ('modules:posts',          'Access Posts module',  'Modules', true),
  ('modules:posts.moderate', 'Moderate posts (soft-delete, reports queue)', 'Modules', true)
ON CONFLICT ("key") DO NOTHING;

-- Auto-grant SOLO della permission base al ruolo admin
-- (la fine-grained `.moderate` resta opt-in da /admin/access/permissions,
-- coerente con la regola del manifest sugli extraPermissions).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'admin' AND p.key = 'modules:posts'
ON CONFLICT DO NOTHING;
