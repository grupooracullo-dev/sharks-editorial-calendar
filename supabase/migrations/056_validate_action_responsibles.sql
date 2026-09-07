-- Validate all assignees before modifying the existing assignment list.
CREATE OR REPLACE FUNCTION public.set_action_responsibles(
  p_action_id uuid,
  p_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  action_workspace uuid;
BEGIN
  SELECT workspace_id INTO action_workspace
  FROM public.actions WHERE id = p_action_id FOR UPDATE;

  IF action_workspace IS NULL OR
     public.ws_env_allows_write(caller, action_workspace) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sem permissao para editar esta acao';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_user_ids) AS requested(user_id)
    WHERE requested.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = requested.user_id
        AND public.ws_visible(u.id, action_workspace) IS TRUE
        AND (u.role = 'oracullo_admin' OR u.is_guardian IS TRUE OR EXISTS (
          SELECT 1 FROM public.user_environments ue
          WHERE ue.user_id = u.id
            AND ue.environment = public.ws_environment(action_workspace)
        ))
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais responsaveis nao possuem acesso ao cliente e ambiente da acao';
  END IF;

  DELETE FROM public.action_responsibles WHERE action_id = p_action_id;
  INSERT INTO public.action_responsibles (action_id, user_id)
  SELECT p_action_id, requested.user_id FROM unnest(p_user_ids) AS requested(user_id)
  ON CONFLICT (action_id, user_id) DO NOTHING;

  UPDATE public.actions SET responsible_id = p_user_ids[1] WHERE id = p_action_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_action_responsibles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_action_responsibles(uuid, uuid[]) TO authenticated, service_role;
