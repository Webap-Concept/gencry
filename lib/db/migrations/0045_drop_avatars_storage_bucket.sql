-- =============================================================================
-- Drop Avatars Storage Bucket (Supabase) — avatar moved to Cloudflare R2
-- =============================================================================
-- Il 2026-05-12/13 abbiamo migrato lo storage degli avatar utente da
-- Supabase Storage (bucket "avatars", creato dalla migration 0025) a
-- Cloudflare R2 (vedi lib/storage/r2-avatars.ts).
--
-- Tutti i call site del codice ora usano uploadAvatarToR2 /
-- uploadAvatarFromUrlToR2:
--   - app/(protected)/settings/profile/actions.ts (upload manuale)
--   - lib/auth/oauth/index.ts (login Google, scarica + uploada su R2)
--
-- Il bucket Supabase è stato lasciato in place finché c'erano avatar
-- legacy ma il progetto NON ha ancora utenti reali (siamo in dev/staging),
-- quindi non serve backfill. Dropping bucket + policies per pulizia.
--
-- Da incollare nel Supabase SQL Editor (richiede service role).
-- DESTRUCTIVE: elimina TUTTI gli avatar nel bucket. Non eseguire se non
-- sei sicuro che il refactor R2 sia attivo e nessun utente ha avatar
-- "di valore" nel bucket Supabase.
-- =============================================================================

-- 1) Drop policies (devono andare prima del bucket)
drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Avatars service role write" on storage.objects;
drop policy if exists "Avatars service role update" on storage.objects;
drop policy if exists "Avatars service role delete" on storage.objects;

-- 2) Delete objects nel bucket (Supabase non permette drop con oggetti dentro)
delete from storage.objects where bucket_id = 'avatars';

-- 3) Delete il bucket stesso
delete from storage.buckets where id = 'avatars';
