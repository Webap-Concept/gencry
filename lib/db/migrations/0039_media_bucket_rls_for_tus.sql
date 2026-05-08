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

-- Abilita RLS su storage.objects (di solito è già attivo su Supabase, lo
-- mettiamo per completezza idempotente).
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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
