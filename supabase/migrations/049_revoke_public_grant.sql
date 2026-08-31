-- ============================================
-- 049: Revoga EXECUTE de PUBLIC em funções SECURITY DEFINER
--      e re-concede de forma seletiva.
--
-- Motivo: REVOKE de roles individuais não remove o acesso herdado
-- de PUBLIC ( privileges = grant direto ∪ PUBLIC ). O grant PUBLIC
-- padrão mantinha todas as DEFINER executáveis por anon/authenticated.
--
-- Política de acesso após esta migração:
--   service_role  -> todas (edge functions usam a service key)
--   authenticated -> todas, exceto as 4 sensíveis (anti-enumeration)
--   anon          -> apenas helpers usados por policies TO public
--                    + ws_env_map (RequestAccess pré-login)
-- ============================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.oid::regprocedure);
  END LOOP;
END $$;

-- Sensíveis: sem uso em policies/app (edge usa service_role)
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_workspaces(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_workspace_members(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_find_auth_user_by_email(text) FROM authenticated;

-- Helpers exigidos pela avaliação de policies TO public (anon)
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_any_env_staff(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_env_admin(uuid, public.environment_type) TO anon;
GRANT EXECUTE ON FUNCTION public.is_env_staff(uuid, public.environment_type) TO anon;
GRANT EXECUTE ON FUNCTION public.is_guardian(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_oracullo_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_sharks_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_sharks_team(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.org_environment(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.ws_env_allows_write(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.ws_environment(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.ws_visible(uuid, uuid) TO anon;

-- RPC de página pré-login (RequestAccess)
GRANT EXECUTE ON FUNCTION public.ws_env_map() TO anon;
