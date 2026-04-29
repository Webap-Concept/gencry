-- =============================================================================
-- Branding Storage Bucket
-- =============================================================================
-- Crea il bucket pubblico "branding" usato dall'admin per logo, logo variant
-- e favicon. Da incollare nel Supabase SQL Editor (richiede service role).
-- Idempotente: può essere ri-eseguito senza effetti collaterali.
-- =============================================================================

-- 1) Bucket pubblico (lettura aperta tramite getPublicUrl)
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = excluded.public;

-- 2) Policy: lettura pubblica
drop policy if exists "Branding public read" on storage.objects;
create policy "Branding public read"
on storage.objects for select
to public
using (bucket_id = 'branding');

-- 3) Policy: scrittura/eliminazione SOLO da service_role
-- (l'app usa SUPABASE_SERVICE_ROLE_KEY lato server in lib/storage/supabase.ts;
-- nessun client browser deve poter scrivere qui)
drop policy if exists "Branding service role write" on storage.objects;
create policy "Branding service role write"
on storage.objects for insert
to service_role
with check (bucket_id = 'branding');

drop policy if exists "Branding service role update" on storage.objects;
create policy "Branding service role update"
on storage.objects for update
to service_role
using (bucket_id = 'branding')
with check (bucket_id = 'branding');

drop policy if exists "Branding service role delete" on storage.objects;
create policy "Branding service role delete"
on storage.objects for delete
to service_role
using (bucket_id = 'branding');
