-- ============================================
-- 061: Hardening de acesso à tabela users e funções de enumeração
--
-- Vulnerabilidades identificadas:
--   1. staff (team, qualquer ambiente) lista TODOS os usuários do
--      sistema (incl. guardião, is_guardian e e-mails) via /rest/v1/users
--   2. admin_find_auth_user_by_email executável por qualquer
--      authenticated -> enumeração/próbing de e-mails existentes
--   3. get_workspace_members / get_user_role / get_user_workspaces
--      executáveis por qualquer authenticated -> enumeração de
--      membros/papéis de qualquer workspace
--   4. users_admin_all: CMD ALL para admin de ambiente sem restrição
--      de linha -> leitura de TODOS os usuários (incl. e-mails e
--      is_guardian) e UPDATE de nome/avatar de terceiros
--
-- Correção:
--   1. users_select: staff só enxerga usuários dos ambientes onde é
--      staff (env-scoped); guardião continua vendo todos; cliente só
--      o próprio perfil.
--   2. Revoga EXECUTE das funções de enumeração para authenticated
--      (service_role e o fluxo de aprovação usam service_role e
--      continuam funcionando).
--   4. Remove users_admin_all: mutações em users são feitas apenas
--      pelas edge functions (service_role); o frontend não mutaciona
--      a tabela; UPDATE self fica limitado a full_name/avatar_url
--      (grants de coluna já existentes).
-- ============================================

-- ---------- 1. users_select com escopo por ambiente ----------
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR is_guardian(auth.uid())
    OR (
      is_any_env_staff(auth.uid())
      AND EXISTS (
        SELECT 1
        FROM user_environments ue_staff
        JOIN user_environments ue_target ON ue_target.environment = ue_staff.environment
        WHERE ue_staff.user_id = auth.uid()
          AND ue_staff.role IN ('admin', 'team')
          AND ue_target.user_id = users.id
      )
    )
  );

-- ---------- 2. Revoga enumeração para authenticated ----------
REVOKE EXECUTE ON FUNCTION public.admin_find_auth_user_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_workspace_members(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_workspaces(uuid) FROM authenticated;

-- ---------- 3. Remove policy admin de acesso irrestrito a users ----------
DROP POLICY IF EXISTS users_admin_all ON public.users;
