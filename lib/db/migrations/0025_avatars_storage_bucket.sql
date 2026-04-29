-- =============================================================================
-- Avatars Storage Bucket
-- =============================================================================
-- Crea il bucket pubblico "avatars" usato per salvare gli avatar dei profili
-- utente (es. immagini scaricate da Google OAuth).
-- Da incollare nel Supabase SQL Editor (richiede service role).
-- Idempotente: può essere ri-eseguito senza effetti collaterali.
-- =============================================================================

-- 1) Bucket pubblico (lettura aperta tramite getPublicUrl)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- 2) Policy: lettura pubblica
drop policy if exists "Avatars public read" on storage.objects;
create policy "Avatars public read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- 3) Policy: scrittura/eliminazione SOLO da service_role
-- (l'app usa SUPABASE_SERVICE_ROLE_KEY lato server; nessun client browser scrive qui)
drop policy if exists "Avatars service role write" on storage.objects;
create policy "Avatars service role write"
on storage.objects for insert
to service_role
with check (bucket_id = 'avatars');

drop policy if exists "Avatars service role update" on storage.objects;
create policy "Avatars service role update"
on storage.objects for update
to service_role
using (bucket_id = 'avatars')
with check (bucket_id = 'avatars');

drop policy if exists "Avatars service role delete" on storage.objects;
create policy "Avatars service role delete"
on storage.objects for delete
to service_role
using (bucket_id = 'avatars');
