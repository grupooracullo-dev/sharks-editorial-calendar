-- 063: corrige regressao do 062 no fluxo pre-login de solicitacao de acesso.
-- A policy access_requests_admin_all era TO PUBLIC e referencia is_guardian,
-- que o 062 revogou do papel anon; o planner reordena os AND (sem
-- short-circuit garantido) e o INSERT anon passou a falhar com 42501.
-- A policy vale apenas para administradores autenticados — recriamos com
-- TO authenticated usando os mesmos quals.
drop policy if exists access_requests_admin_all on public.access_requests;

create policy access_requests_admin_all
  on public.access_requests
  for all
  to authenticated
  using (
    (auth.uid() IS NOT NULL)
    AND (
      is_guardian(auth.uid())
      OR exists (
        select 1 from public.user_environments ue
        where ue.user_id = auth.uid()
          and ue.role = 'admin'::environment_role
      )
    )
  )
  with check (
    (auth.uid() IS NOT NULL)
    AND (
      is_guardian(auth.uid())
      OR exists (
        select 1 from public.user_environments ue
        where ue.user_id = auth.uid()
          and ue.role = 'admin'::environment_role
      )
    )
  );
