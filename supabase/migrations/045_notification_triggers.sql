-- ============================================
-- 045_notification_triggers.sql
-- Lógica de notificações por usuário (server-authoritative).
-- Todos os triggers são SECURITY DEFINER: o INSERT de notificação
-- para TERCEIROS não pode passar pelo RLS do ator (ex.: cliente
-- mandando mensagem no chat precisa notificar o time).
-- Nunca notifica o próprio ator (auth.uid()).
-- ============================================

-- ---------- Helper: label de status de ação ----------
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

-- ---------- Helper: admins do ambiente + guardiões ----------
CREATE OR REPLACE FUNCTION public.notify_env_admins(p_environment text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ue.user_id
  FROM public.user_environments ue
  WHERE ue.environment::text = p_environment AND ue.role = 'admin'
  UNION
  SELECT u.id
  FROM public.users u
  WHERE u.is_guardian OR u.role = 'oracullo_admin';
$$;

-- ---------- 1. Ações: atribuição + mudança de status + publicação ----------
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

DROP TRIGGER IF EXISTS trg_notify_action_events ON public.actions;
CREATE TRIGGER trg_notify_action_events
  AFTER INSERT OR UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.notify_action_events();

-- ---------- 2. Chat: nova mensagem → membros do workspace ----------
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

DROP TRIGGER IF EXISTS trg_notify_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message();

-- ---------- 3. Solicitação de acesso → guardiões + admins dos ambientes ----------
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

DROP TRIGGER IF EXISTS trg_notify_access_request ON public.access_requests;
CREATE TRIGGER trg_notify_access_request
  AFTER INSERT ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_access_request();

-- ---------- 4. Erro de sync Google → dono da integração + admins do ambiente ----------
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

DROP TRIGGER IF EXISTS trg_notify_sync_error ON public.calendar_integrations;
CREATE TRIGGER trg_notify_sync_error
  AFTER UPDATE ON public.calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION public.notify_sync_error();

-- ---------- 5. Projeto Estrategos: atribuição + mudança de status ----------
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

DROP TRIGGER IF EXISTS trg_notify_project_events ON public.estrategos_projects;
CREATE TRIGGER trg_notify_project_events
  AFTER INSERT OR UPDATE ON public.estrategos_projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_events();
