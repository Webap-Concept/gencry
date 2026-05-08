-- 0038_media_assets_confirmed_at.sql
-- Aggiunge `confirmed_at` a `media_assets` per supportare il flusso TUS /
-- signed-URL upload diretto al bucket.
--
-- Why: i file >4MB non possono passare per le server actions Next.js
-- perché Vercel ha un hard cap di 4.5MB sul body delle serverless
-- functions (vale su tutti i piani). Il nuovo flusso è in 3 step:
--   1. server action `createMediaUploadTicket` → INSERT con
--      confirmed_at=NULL + signed upload URL Supabase
--   2. client → PUT diretto al bucket via XHR (progress events reali)
--   3. server action `confirmMediaUpload` → verifica file presente +
--      confirmed_at = now()
--
-- Le righe con confirmed_at IS NULL sono "draft": un cron giornaliero
-- (`media-orphan-cleanup`, da configurare in Supabase pg_cron) può
-- cancellare draft più vecchie di 24h che non sono mai state confermate
-- (utente abbandona dialog, browser crash, errori di rete a metà PUT).

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;

-- Backfill: tutte le righe esistenti sono state caricate dal vecchio
-- flusso server-action sincrono → quando la riga DB esiste, l'oggetto
-- nel bucket esiste anche. Marchiamo tutte come confermate al loro
-- timestamp di creazione, così la WHERE confirmed_at IS NULL identifica
-- correttamente solo le draft create dal NUOVO flusso.
UPDATE media_assets
   SET confirmed_at = created_at
 WHERE confirmed_at IS NULL;

-- Indice parziale: solo righe NON confermate, supporta query di cleanup
-- giornaliero. Su una libreria di N asset confermati e ~poche draft
-- residue, l'indice resta minuscolo e selettivo.
CREATE INDEX IF NOT EXISTS idx_media_assets_unconfirmed
  ON media_assets (created_at)
  WHERE confirmed_at IS NULL;
