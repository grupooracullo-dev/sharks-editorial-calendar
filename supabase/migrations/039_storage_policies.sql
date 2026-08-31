-- ============================================
-- 039_storage_policies.sql
-- Storage: documentar estado real (drift) + fechar lacunas
--
--  1) avatars: limites de bucket (2MB, imagens raster) ja aplicados
--     manualmente no projeto — replicados aqui para que um restore
--     a partir do repo reproduza o estado atual.
--  2) avatars: recria policies own-folder (existiam apenas fora do repo).
--  3) avatars: ADD avatars_read (SELECT para authenticated) — o .list()
--     do cleanup de avatars antigos falhava silenciosamente sem ela.
--  4) workspace-logos: ADD policy DELETE para staff — habilita a
--     remocao do logo anterior no upload de substituicao.
-- ============================================

-- 1) Limites do bucket avatars (idempotente)
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
where id = 'avatars';

-- 2) Policies own-folder (documentacao/drift)
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) Leitura para authenticated — necessaria para .list() no cleanup
--    (URLs publicas continuam funcionando: bucket e publico)
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

-- 4) Remocao de logos substituidos (staff, mesmo criterio do insert/update)
drop policy if exists workspace_logos_delete on storage.objects;
create policy workspace_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-logos'
    and (
      public.is_guardian(auth.uid())
      or public.is_sharks_admin(auth.uid())
      or public.is_sharks_team(auth.uid())
      or public.is_oracullo_admin(auth.uid())
      or public.is_estrategos_admin(auth.uid())
      or public.is_estrategos_team(auth.uid())
    )
  );
