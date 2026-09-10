-- ============================================
-- 059: Triggers de notificação sem duplicação
--
-- 1. notify_access_request: solicitações multi-ambiente notificam
--    cada admin UMA vez (DISTINCT via LATERAL sobre os ambientes).
-- 2. notify_sync_error: throttle de 6h — não insere se já existe
--    notificação idêntica (mesmo usuário + mesma mensagem).
-- (Corpo pós-055 — texto com acentos corretos.)
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_access_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_envs text[];
BEGIN
  -- requested_environments é jsonb: extrai como text[]
  IF NEW.requested_environments IS NOT NULL THEN
    SELECT array_agg(e) INTO v_envs
    FROM jsonb_array_elements_text(NEW.requested_environments) AS e;
  END IF;
  IF v_envs IS NULL OR array_length(v_envs, 1) IS NULL THEN
    v_envs := ARRAY['sharks_company'];
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message)
  SELECT DISTINCT
    a.user_id,
    'access_request',
    'Nova solicitação de acesso',
    coalesce(NEW.full_name, NEW.email) || ' solicitou acesso. Revise na página Acessos.'
  FROM unnest(v_envs) AS e(env)
  CROSS JOIN LATERAL public.notify_env_admins(e.env) AS a(user_id);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_sync_error()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_env text;
BEGIN
  IF NEW.sync_error IS NOT NULL AND OLD.sync_error IS DISTINCT FROM NEW.sync_error THEN
    IF NEW.workspace_id IS NOT NULL THEN
      v_env := public.ws_environment(NEW.workspace_id);
      IF v_env IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
        SELECT
          a.user_id,
          NEW.workspace_id,
          'sync_error',
          'Erro de sincronização Google',
          left(NEW.sync_error, 160)
        FROM public.notify_env_admins(v_env) AS a(user_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = a.user_id
            AND n.type = 'sync_error'
            AND n.message = left(NEW.sync_error, 160)
            AND n.created_at > now() - interval '6 hours'
        );
      END IF;
    END IF;

    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
      SELECT
        NEW.user_id,
        NEW.workspace_id,
        'sync_error',
        'Erro de sincronização Google',
        left(NEW.sync_error, 160)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = NEW.user_id
          AND n.type = 'sync_error'
          AND n.message = left(NEW.sync_error, 160)
          AND n.created_at > now() - interval '6 hours'
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
