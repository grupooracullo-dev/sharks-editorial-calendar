-- ============================================
-- 055: Reparo de encoding (U+FFFD) nas funcoes de notificacao
-- Causa: aplicacao anterior destes arquivos usou leitura ANSI
-- (Get-Content sem UTF8) -> strings com acento viraram U+FFFD.
-- Re-aplica as definicoes das funcoes (idempotente, UTF-8 correto),
-- limpa as notificacoes corrompidas e resolve item de fila travado.
-- ============================================
CREATE OR REPLACE FUNCTION public.action_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'Rascunho'
    WHEN 'briefing' THEN 'Briefing'
    WHEN 'in_production' THEN 'Em produção'
    WHEN 'sharks_review' THEN 'Revisão Sharks'
    WHEN 'scheduled' THEN 'Agendada'
    WHEN 'published' THEN 'Publicada'
    WHEN 'completed' THEN 'Concluída'
    WHEN 'cancelled' THEN 'Cancelada'
    WHEN 'overdue' THEN 'Atrasada'
    ELSE initcap(coalesce(p_status, ''))
  END
$$;

CREATE OR REPLACE FUNCTION public.notify_action_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- Atribuição: INSERT com responsável OU troca de responsável
  IF (TG_OP = 'INSERT' AND NEW.responsible_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.responsible_id IS NOT NULL
         AND OLD.responsible_id IS DISTINCT FROM NEW.responsible_id) THEN
    IF v_actor IS NULL OR v_actor <> NEW.responsible_id THEN
      INSERT INTO public.notifications (user_id, workspace_id, action_id, type, title, message)
      VALUES (
        NEW.responsible_id,
        NEW.workspace_id,
        NEW.id,
        'action_assigned',
        'Nova ação atribuída a você',
        NEW.title || CASE
          WHEN NEW.action_date IS NOT NULL THEN ' — ' || to_char(NEW.action_date, 'DD/MM/YYYY')
          ELSE '' END
      );
    END IF;
  END IF;

  -- Mudança de status → responsável atual (não o autor da mudança)
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.responsible_id IS NOT NULL
     AND (v_actor IS NULL OR v_actor <> NEW.responsible_id) THEN
    INSERT INTO public.notifications (user_id, workspace_id, action_id, type, title, message)
    VALUES (
      NEW.responsible_id,
      NEW.workspace_id,
      NEW.id,
      'action_status_changed',
      'Status da sua ação mudou',
      NEW.title || ': ' || public.action_status_label(OLD.status::text)
        || ' → ' || public.action_status_label(NEW.status::text)
    );
  END IF;

  -- Publicada / concluída → clientes membros do workspace
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('published', 'completed') THEN
    INSERT INTO public.notifications (user_id, workspace_id, action_id, type, title, message)
    SELECT
      m.user_id,
      NEW.workspace_id,
      NEW.id,
      'action_status_changed',
      CASE WHEN NEW.status = 'published' THEN 'Sua ação foi publicada' ELSE 'Sua ação foi concluída' END,
      NEW.title
    FROM public.memberships m
    WHERE m.workspace_id = NEW.workspace_id
      AND m.role = 'member'
      AND (v_actor IS NULL OR m.user_id <> v_actor);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ws uuid;
  v_sender text;
BEGIN
  IF v_actor IS NULL THEN RETURN NULL; END IF;

  SELECT ct.workspace_id INTO v_ws
  FROM public.chat_threads ct
  WHERE ct.id = NEW.thread_id;
  IF v_ws IS NULL THEN RETURN NULL; END IF;

  SELECT u.full_name INTO v_sender FROM public.users u WHERE u.id = v_actor;

  INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
  SELECT
    m.user_id,
    v_ws,
    'message',
    'Nova mensagem no chat',
    left(coalesce(v_sender, 'Alguém') || ': ' || NEW.content, 120)
  FROM public.memberships m
  WHERE m.workspace_id = v_ws
    AND m.user_id <> v_actor;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_access_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_envs text[];
  v_i int;
BEGIN
  -- requested_environments é jsonb: extrai como text[]
  IF NEW.requested_environments IS NOT NULL THEN
    SELECT array_agg(e) INTO v_envs
    FROM jsonb_array_elements_text(NEW.requested_environments) AS e;
  END IF;
  IF v_envs IS NULL OR array_length(v_envs, 1) IS NULL THEN
    v_envs := ARRAY['sharks_company'];
  END IF;

  FOR v_i IN 1..array_length(v_envs, 1) LOOP
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT
      a.user_id,
      'access_request',
      'Nova solicitação de acesso',
      coalesce(NEW.full_name, NEW.email) || ' solicitou acesso. Revise na página Acessos.'
    FROM public.notify_env_admins(v_envs[v_i]) AS a(user_id);
  END LOOP;

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
        FROM public.notify_env_admins(v_env) AS a(user_id);
      END IF;
    END IF;

    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
      VALUES (
        NEW.user_id,
        NEW.workspace_id,
        'sync_error',
        'Erro de sincronização Google',
        left(NEW.sync_error, 160)
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_project_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.responsible_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.responsible_id IS NOT NULL
         AND OLD.responsible_id IS DISTINCT FROM NEW.responsible_id) THEN
    IF v_actor IS NULL OR v_actor <> NEW.responsible_id THEN
      INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
      VALUES (
        NEW.responsible_id,
        NEW.workspace_id,
        'action_assigned',
        'Novo projeto atribuído a você',
        NEW.name
      );
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.responsible_id IS NOT NULL
     AND (v_actor IS NULL OR v_actor <> NEW.responsible_id) THEN
    INSERT INTO public.notifications (user_id, workspace_id, type, title, message)
    VALUES (
      NEW.responsible_id,
      NEW.workspace_id,
      'action_status_changed',
      'Status do projeto mudou',
      NEW.name || ': ' || coalesce(OLD.status, '—') || ' → ' || coalesce(NEW.status, '—')
    );
  END IF;

  RETURN NULL;
END;
$$;

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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = p_action_id
      AND ws_env_allows_write(caller, a.workspace_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para editar esta acao';
  END IF;

  DELETE FROM public.action_responsibles WHERE action_id = p_action_id;

  IF p_user_ids IS NOT NULL THEN
    INSERT INTO public.action_responsibles (action_id, user_id)
    SELECT p_action_id, uid
    FROM unnest(p_user_ids) AS uid
    ON CONFLICT (action_id, user_id) DO NOTHING;
  END IF;

  -- Compatibilidade: responsible_id = responsável principal (1º da lista)
  UPDATE public.actions
  SET responsible_id = p_user_ids[1]
  WHERE id = p_action_id;
END $$;

DELETE FROM notifications WHERE title LIKE '%' || chr(65533) || '%' OR message LIKE '%' || chr(65533) || '%';
UPDATE calendar_sync_queue SET status = 'done', processed_at = now() WHERE status = 'error';
SELECT (SELECT string_agg(proname, ',') FROM pg_proc WHERE pronamespace='public'::regnamespace AND pg_get_functiondef(oid) LIKE '%' || chr(65533) || '%') AS ainda_ffd, (SELECT count(*) FROM notifications WHERE title LIKE '%' || chr(65533) || '%') AS notifs_ffd;
