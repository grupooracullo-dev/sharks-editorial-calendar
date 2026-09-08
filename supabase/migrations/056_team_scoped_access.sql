-- ============================================
-- 056: Acesso do TIME restrito aos clientes vinculados
--
-- Problema: ws_visible/ws_env_allows_write tratavam o papel 'team'
-- como staff de TODO o ambiente — um membro vinculado a apenas um
-- cliente via todos os clientes daquele ambiente (e do outro, se
-- tivesse papel nos dois).
--
-- Regra nova:
--   guardiao            -> todos os workspaces
--   admin do ambiente   -> todos os workspaces do ambiente
--   team                -> SOMENTE workspaces com membership (vínculo)
--   client              -> SOMENTE o próprio workspace (inalterado)
-- ============================================

CREATE OR REPLACE FUNCTION public.ws_visible(user_uuid uuid, ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    is_guardian(user_uuid)
    OR public.env_role(user_uuid, public.ws_environment(ws_id)) = 'admin'
    OR (
      public.env_role(user_uuid, public.ws_environment(ws_id)) IN ('team', 'client')
      AND EXISTS (
        SELECT 1 FROM memberships
        WHERE user_id = user_uuid AND workspace_id = ws_id
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.ws_env_allows_write(user_uuid uuid, ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    has_env_access(user_uuid, ws_environment(ws_id), ARRAY['admin']::environment_role[])
    OR (
      has_env_access(user_uuid, ws_environment(ws_id), ARRAY['team']::environment_role[])
      AND EXISTS (
        SELECT 1 FROM memberships
        WHERE user_id = user_uuid AND workspace_id = ws_id
      )
    );
$function$;
