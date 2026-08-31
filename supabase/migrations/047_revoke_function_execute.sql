-- ============================================
-- 047: Function EXECUTE revokes
-- 1) SECURITY DEFINER: revoga EXECUTE de anon
--    (nenhuma policy anon chama funções diretamente;
--     policies TO public mantêm acesso via public grant)
-- 2) Funções sensíveis sem uso em policies/app:
--    revoga de authenticated também (anti-enumeration)
-- ============================================

-- ---------- 1. Revoke anon em SECURITY DEFINER ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.oid::regprocedure);
  END LOOP;
END $$;

-- Re-grant: helpers usados por policies TO public + RPC de página pré-login
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
GRANT EXECUTE ON FUNCTION public.ws_env_map() TO anon;

-- ---------- 2. Revoke authenticated (funções sensíveis) ----------
REVOKE EXECUTE ON FUNCTION public.get_user_workspaces(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_workspace_members(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_find_auth_user_by_email(text) FROM authenticated;
