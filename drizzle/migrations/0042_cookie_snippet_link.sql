-- Migration: 0042_cookie_snippet_link.sql
-- Lega bidirezionalmente cookie_services e site_snippets:
--
-- 1. site_snippets.cookie_service_id (nullable FK):
--    Se valorizzato, lo snippet viene caricato in pagina solo quando
--    l'utente ha acconsentito alla categoria del servizio collegato.
--    Se NULL → snippet "always-on" (tipico per cookie tecnici e snippet
--    senza tracking, es. consent banner).
--    ON DELETE SET NULL: cancellando il servizio lo snippet diventa
--    always-on senza spegnersi — il badge admin lo segnala.
--
-- 2. cookie_services.requires_snippet (boolean, default true):
--    Quando true → l'admin UI mostra un badge "Snippet configured /
--    to configure" per quel servizio, così non serve ricordarsi di
--    creare anche lo snippet dopo aver dichiarato il cookie.
--    Si setta a false per:
--      - cookie tecnici gestiti server-side (session, csrf, cookie_consent)
--      - script hardcoded gated nel codice (Vercel Analytics in
--        app/layout.tsx). Per questi non c'è uno snippet utente.
--
-- Eseguire nel SQL Editor di Supabase. Idempotente.

-- ── 1. site_snippets.cookie_service_id ─────────────────────────────────────
ALTER TABLE site_snippets
  ADD COLUMN IF NOT EXISTS cookie_service_id varchar(100)
    REFERENCES cookie_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_snippets_cookie_service
  ON site_snippets (cookie_service_id)
  WHERE cookie_service_id IS NOT NULL;

-- ── 2. cookie_services.requires_snippet ────────────────────────────────────
ALTER TABLE cookie_services
  ADD COLUMN IF NOT EXISTS requires_snippet boolean NOT NULL DEFAULT true;

-- Backfill: i 4 servizi system seed NON necessitano di snippet user-managed.
--   - session/csrf/cookie_consent: cookie HttpOnly del nostro server.
--   - vercel_analytics: caricato via <Analytics /> hardcoded in app/layout.tsx,
--     già gated da `analyticsAllowed = bannerEnabled && consent.analytics`.
UPDATE cookie_services
   SET requires_snippet = false
 WHERE id IN ('session', 'csrf', 'cookie_consent', 'vercel_analytics');
