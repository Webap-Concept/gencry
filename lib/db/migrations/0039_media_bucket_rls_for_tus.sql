-- 0039_media_bucket_rls_for_tus.sql
-- RLS policy sul bucket `media` per permettere upload TUS resumable
-- direttamente dal client.
--
-- Why: il vecchio flusso usava `getStorageClient()` con SUPABASE_SERVICE_ROLE_KEY
-- server-side → bypassava RLS. Il nuovo flusso TUS è client→bucket diretto
-- con un JWT custom mintato lato server (TTL 2 min, sub=adminUserId,
-- aud='authenticated', role='authenticated', firmato con SUPABASE_JWT_SECRET).
-- RLS quindi entra in gioco e va aperta esplicitamente.
--
-- TUS protocol = INSERT + UPDATE su `storage.objects` (POST /upload + PATCH).
-- Servono entrambi.
--
-- Restringiamo al bucket 'media' specifico per minimo blast radius: anche
-- se un JWT venisse leakato (TTL 2 min limita comunque) può scrivere SOLO
-- in quel bucket, non altrove. Asset cleanup da `confirmed_at IS NULL` >24h
-- gestito dall'app (vedi `deleteUnconfirmedAssets` in media-queries.ts +
-- cron `media-orphan-cleanup` da configurare).

-- NB Supabase: RLS su storage.objects è già abilitata di default (la
-- table è di proprietà del ruolo `supabase_storage_admin`, non `postgres`,
-- quindi l'SQL Editor non può eseguire `ALTER TABLE ... ENABLE RLS` —
-- error 42501 must be owner of table objects). Le CREATE POLICY qui
-- sotto invece funzionano dall'SQL Editor perché Supabase grant-a i
-- permessi specifici per la creazione di policy.
--
-- Se ANCHE le CREATE POLICY falliscono con "must be owner", fallback:
--   Dashboard Supabase → Storage → bucket `media` → tab "Policies" →
--   "New Policy" → per ogni operation (INSERT/UPDATE/SELECT) crea una
--   policy "For authenticated users only" con WITH CHECK / USING
--   `bucket_id = 'media'`. Equivalente, no SQL.

-- INSERT policy: utente autenticato può creare oggetti nel bucket 'media'.
-- Non discriminiamo per path: il path è generato server-side
-- (createMediaUploadTicket), il client riceve un signed/JWT contesto e
-- non può inventare path arbitrari (la riga DB è già pre-creata col
-- path predeterminato).
DROP POLICY IF EXISTS "media_authenticated_insert" ON storage.objects;
CREATE POLICY "media_authenticated_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

-- UPDATE policy: TUS usa PATCH per appendere chunk. Senza UPDATE l'upload
-- riprende da 0 a ogni richiesta.
DROP POLICY IF EXISTS "media_authenticated_update" ON storage.objects;
CREATE POLICY "media_authenticated_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');

-- SELECT policy: serve a TUS per HEAD/check-existence durante il resume.
-- Manteniamo lettura aperta a authenticated nel bucket media (gli URL
-- pubblici sono comunque accessibili al mondo via getPublicUrl).
DROP POLICY IF EXISTS "media_authenticated_select" ON storage.objects;
CREATE POLICY "media_authenticated_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'media');

-- DELETE: NON aperto al client. La cancellazione asset passa per server
-- action (`deleteMediaAsset` con check `countAssetReferences`) che usa
-- ancora il service-role client. Service-role bypassa RLS, quindi
-- nessuna policy DELETE serve qui.
