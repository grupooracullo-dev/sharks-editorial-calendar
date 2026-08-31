-- ============================================
-- 046: FK indexes + search_path pinning
-- 1) Índices para FKs sem índice (advisor: unindexed_foreign_keys)
-- 2) Fixa search_path em funções public sem proconfig
--    (advisor: function_search_path_mutable)
-- ============================================

-- ---------- 1. FK indexes ----------
CREATE INDEX IF NOT EXISTS access_histories_performed_by_idx ON public.access_histories(performed_by);
CREATE INDEX IF NOT EXISTS access_histories_workspace_id_idx ON public.access_histories(workspace_id);
CREATE INDEX IF NOT EXISTS access_requests_approved_by_idx ON public.access_requests(approved_by);
CREATE INDEX IF NOT EXISTS access_requests_workspace_id_idx ON public.access_requests(workspace_id);
CREATE INDEX IF NOT EXISTS actions_created_by_idx ON public.actions(created_by);
CREATE INDEX IF NOT EXISTS actions_responsible_id_idx ON public.actions(responsible_id);
CREATE INDEX IF NOT EXISTS attachments_action_id_idx ON public.attachments(action_id);
CREATE INDEX IF NOT EXISTS attachments_uploaded_by_idx ON public.attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS calendar_event_links_integration_id_idx ON public.calendar_event_links(integration_id);
CREATE INDEX IF NOT EXISTS calendar_event_links_workspace_id_idx ON public.calendar_event_links(workspace_id);
CREATE INDEX IF NOT EXISTS calendar_templates_organization_id_idx ON public.calendar_templates(organization_id);
CREATE INDEX IF NOT EXISTS campaigns_workspace_id_idx ON public.campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS chat_messages_action_id_idx ON public.chat_messages(action_id);
CREATE INDEX IF NOT EXISTS chat_messages_sender_id_idx ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS chat_threads_workspace_id_idx ON public.chat_threads(workspace_id);
CREATE INDEX IF NOT EXISTS estrategos_implementations_created_by_idx ON public.estrategos_implementations(created_by);
CREATE INDEX IF NOT EXISTS estrategos_implementations_project_id_idx ON public.estrategos_implementations(project_id);
CREATE INDEX IF NOT EXISTS estrategos_meetings_created_by_idx ON public.estrategos_meetings(created_by);
CREATE INDEX IF NOT EXISTS estrategos_meetings_project_id_idx ON public.estrategos_meetings(project_id);
CREATE INDEX IF NOT EXISTS estrategos_projects_created_by_idx ON public.estrategos_projects(created_by);
CREATE INDEX IF NOT EXISTS estrategos_projects_responsible_id_idx ON public.estrategos_projects(responsible_id);
CREATE INDEX IF NOT EXISTS notifications_action_id_idx ON public.notifications(action_id);
CREATE INDEX IF NOT EXISTS notifications_workspace_id_idx ON public.notifications(workspace_id);
CREATE INDEX IF NOT EXISTS user_environments_granted_by_idx ON public.user_environments(granted_by);

-- ---------- 2. search_path pinning ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public', r.oid::regprocedure);
  END LOOP;
END $$;
