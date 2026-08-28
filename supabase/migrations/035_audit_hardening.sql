-- ============================================
-- 035_audit_hardening.sql
-- Auditoria profunda: endurecimento seguro
--  1) bucket workspace-logos: limite de 2 MB + MIME apenas de imagem
--  2) escrita em workspace-logos restrita a staff (guardian/admin/team)
--  3) revoga grants residuais de anon nas tabelas public (defesa em profundidade)
-- Nenhuma mudanca de comportamento para usuarios legitimados.
-- ============================================

-- 1) workspace-logos: limite de tamanho e MIME no BUCKET (era aberto)
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
where id = 'workspace-logos';

-- 2) workspace-logos: escrita apenas para staff (guardian + admin/team de qualquer env).
--    Antes: qualquer authenticated podia inserir/sobrescrever QUALQUER logo (IDOR).
drop policy if exists workspace_logos_insert on storage.objects;
create policy workspace_logos_insert on storage.objects
  for insert to authenticated
  with check (
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

drop policy if exists workspace_logos_update on storage.objects;
create policy workspace_logos_update on storage.objects
  for update to authenticated
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

-- leitura continua publica (logos sao publicos) — policy workspace_logos_read mantida.
-- avatars ja sao escopados por pasta (avatars/<user_id>/) — mantidas.

-- 3) Revoga grants residuais de anon (RSL ja bloqueava, mas TRUNCATE/DDL
--    nao passam por RSL; PostgREST nao expoe TRUNCATE, ainda assim revogar
--    e' defesa em profundidade padrao do Supabase).
revoke all privileges on all tables in schema public from anon;