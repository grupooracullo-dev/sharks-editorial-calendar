DROP POLICY IF EXISTS "access_hist_insert" ON public.access_histories;
CREATE POLICY "access_hist_insert" ON public.access_histories AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment)));

DROP POLICY IF EXISTS "access_hist_select" ON public.access_histories;
CREATE POLICY "access_hist_select" ON public.access_histories AS PERMISSIVE FOR SELECT TO public USING ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment)));

DROP POLICY IF EXISTS "access_requests_admin_all" ON public.access_requests;
CREATE POLICY "access_requests_admin_all" ON public.access_requests AS PERMISSIVE FOR ALL TO public USING ((is_guardian((select auth.uid())) OR (EXISTS ( SELECT 1
   FROM user_environments ue
  WHERE ((ue.user_id = (select auth.uid())) AND (ue.role = 'admin'::environment_role)))))) WITH CHECK ((is_guardian((select auth.uid())) OR (EXISTS ( SELECT 1
   FROM user_environments ue
  WHERE ((ue.user_id = (select auth.uid())) AND (ue.role = 'admin'::environment_role))))));

DROP POLICY IF EXISTS "access_requests_insert" ON public.access_requests;
CREATE POLICY "access_requests_insert" ON public.access_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND ((auth_provider IS DISTINCT FROM 'google'::text) OR (lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))))));

DROP POLICY IF EXISTS "access_requests_select_own" ON public.access_requests;
CREATE POLICY "access_requests_select_own" ON public.access_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((lower(email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text))));

DROP POLICY IF EXISTS "actions_select" ON public.actions;
CREATE POLICY "actions_select" ON public.actions AS PERMISSIVE FOR SELECT TO public USING (ws_visible((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "actions_team_delete" ON public.actions;
CREATE POLICY "actions_team_delete" ON public.actions AS PERMISSIVE FOR DELETE TO public USING (ws_env_allows_write((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "actions_team_insert" ON public.actions;
CREATE POLICY "actions_team_insert" ON public.actions AS PERMISSIVE FOR INSERT TO public WITH CHECK (ws_env_allows_write((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "actions_team_update" ON public.actions;
CREATE POLICY "actions_team_update" ON public.actions AS PERMISSIVE FOR UPDATE TO public USING (ws_env_allows_write((select auth.uid()), workspace_id)) WITH CHECK (ws_env_allows_write((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "attachments_insert" ON public.attachments;
CREATE POLICY "attachments_insert" ON public.attachments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM actions a
  WHERE ((a.id = attachments.action_id) AND (is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid())))))));

DROP POLICY IF EXISTS "attachments_select" ON public.attachments;
CREATE POLICY "attachments_select" ON public.attachments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM actions a
  WHERE ((a.id = attachments.action_id) AND has_workspace_access((select auth.uid()), a.workspace_id)))));

DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "audit_select" ON public.audit_logs;
CREATE POLICY "audit_select" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "event_links_select" ON public.calendar_event_links;
CREATE POLICY "event_links_select" ON public.calendar_event_links AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "event_links_team_all" ON public.calendar_event_links;
CREATE POLICY "event_links_team_all" ON public.calendar_event_links AS PERMISSIVE FOR ALL TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "integrations_client_select" ON public.calendar_integrations;
CREATE POLICY "integrations_client_select" ON public.calendar_integrations AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = (select auth.uid())) AND (workspace_id IS NOT NULL) AND has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "integrations_client_update" ON public.calendar_integrations;
CREATE POLICY "integrations_client_update" ON public.calendar_integrations AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = (select auth.uid())) AND (workspace_id IS NOT NULL) AND has_workspace_access((select auth.uid()), workspace_id))) WITH CHECK (((user_id = (select auth.uid())) AND (workspace_id IS NOT NULL) AND has_workspace_access((select auth.uid()), workspace_id)));

DROP POLICY IF EXISTS "integrations_select" ON public.calendar_integrations;
CREATE POLICY "integrations_select" ON public.calendar_integrations AS PERMISSIVE FOR SELECT TO public USING (((user_id = (select auth.uid())) OR is_guardian((select auth.uid())) OR ((user_id IS NULL) AND (workspace_id IS NOT NULL) AND is_env_staff((select auth.uid()), ws_environment(workspace_id)))));

DROP POLICY IF EXISTS "integrations_team_all" ON public.calendar_integrations;
CREATE POLICY "integrations_team_all" ON public.calendar_integrations AS PERMISSIVE FOR ALL TO public USING (((user_id = (select auth.uid())) OR is_guardian((select auth.uid())) OR ((user_id IS NULL) AND (workspace_id IS NOT NULL) AND is_env_admin((select auth.uid()), ws_environment(workspace_id))))) WITH CHECK (((user_id = (select auth.uid())) OR is_guardian((select auth.uid())) OR ((user_id IS NULL) AND (workspace_id IS NOT NULL) AND is_env_admin((select auth.uid()), ws_environment(workspace_id)))));

DROP POLICY IF EXISTS "queue_select" ON public.calendar_sync_queue;
CREATE POLICY "queue_select" ON public.calendar_sync_queue AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "queue_team_all" ON public.calendar_sync_queue;
CREATE POLICY "queue_team_all" ON public.calendar_sync_queue AS PERMISSIVE FOR ALL TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "templates_admin_all" ON public.calendar_templates;
CREATE POLICY "templates_admin_all" ON public.calendar_templates AS PERMISSIVE FOR ALL TO public USING (is_sharks_admin((select auth.uid())));

DROP POLICY IF EXISTS "templates_select" ON public.calendar_templates;
CREATE POLICY "templates_select" ON public.calendar_templates AS PERMISSIVE FOR SELECT TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
CREATE POLICY "campaigns_select" ON public.campaigns AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "campaigns_team_delete" ON public.campaigns;
CREATE POLICY "campaigns_team_delete" ON public.campaigns AS PERMISSIVE FOR DELETE TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "campaigns_team_insert" ON public.campaigns;
CREATE POLICY "campaigns_team_insert" ON public.campaigns AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "campaigns_team_update" ON public.campaigns;
CREATE POLICY "campaigns_team_update" ON public.campaigns AS PERMISSIVE FOR UPDATE TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "channels_select" ON public.channels;
CREATE POLICY "channels_select" ON public.channels AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "channels_team_all" ON public.channels;
CREATE POLICY "channels_team_all" ON public.channels AS PERMISSIVE FOR ALL TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "messages_insert" ON public.chat_messages;
CREATE POLICY "messages_insert" ON public.chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_threads ct
  WHERE ((ct.id = chat_messages.thread_id) AND has_workspace_access((select auth.uid()), ct.workspace_id)))));

DROP POLICY IF EXISTS "messages_mark_read" ON public.chat_messages;
CREATE POLICY "messages_mark_read" ON public.chat_messages AS PERMISSIVE FOR UPDATE TO public USING (((sender_id <> (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM chat_threads ct
  WHERE ((ct.id = chat_messages.thread_id) AND has_workspace_access((select auth.uid()), ct.workspace_id)))))) WITH CHECK (((status = 'read'::text) AND (sender_id <> (select auth.uid()))));

DROP POLICY IF EXISTS "messages_select" ON public.chat_messages;
CREATE POLICY "messages_select" ON public.chat_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM chat_threads ct
  WHERE ((ct.id = chat_messages.thread_id) AND has_workspace_access((select auth.uid()), ct.workspace_id)))));

DROP POLICY IF EXISTS "thread_reads_insert_own" ON public.chat_thread_reads;
CREATE POLICY "thread_reads_insert_own" ON public.chat_thread_reads AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "thread_reads_select_own" ON public.chat_thread_reads;
CREATE POLICY "thread_reads_select_own" ON public.chat_thread_reads AS PERMISSIVE FOR SELECT TO public USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "thread_reads_update_own" ON public.chat_thread_reads;
CREATE POLICY "thread_reads_update_own" ON public.chat_thread_reads AS PERMISSIVE FOR UPDATE TO public USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "threads_insert" ON public.chat_threads;
CREATE POLICY "threads_insert" ON public.chat_threads AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "threads_select" ON public.chat_threads;
CREATE POLICY "threads_select" ON public.chat_threads AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "pillars_select" ON public.editorial_pillars;
CREATE POLICY "pillars_select" ON public.editorial_pillars AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "pillars_team_all" ON public.editorial_pillars;
CREATE POLICY "pillars_team_all" ON public.editorial_pillars AS PERMISSIVE FOR ALL TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "profiles_select" ON public.editorial_profiles;
CREATE POLICY "profiles_select" ON public.editorial_profiles AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "profiles_team_insert" ON public.editorial_profiles;
CREATE POLICY "profiles_team_insert" ON public.editorial_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "profiles_team_update" ON public.editorial_profiles;
CREATE POLICY "profiles_team_update" ON public.editorial_profiles AS PERMISSIVE FOR UPDATE TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "ei_select" ON public.estrategos_implementations;
CREATE POLICY "ei_select" ON public.estrategos_implementations AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "ei_write" ON public.estrategos_implementations;
CREATE POLICY "ei_write" ON public.estrategos_implementations AS PERMISSIVE FOR ALL TO public USING ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id)))) WITH CHECK ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id))));

DROP POLICY IF EXISTS "em_select" ON public.estrategos_meetings;
CREATE POLICY "em_select" ON public.estrategos_meetings AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "em_write" ON public.estrategos_meetings;
CREATE POLICY "em_write" ON public.estrategos_meetings AS PERMISSIVE FOR ALL TO public USING ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id)))) WITH CHECK ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id))));

DROP POLICY IF EXISTS "ep_select" ON public.estrategos_projects;
CREATE POLICY "ep_select" ON public.estrategos_projects AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "ep_write" ON public.estrategos_projects;
CREATE POLICY "ep_write" ON public.estrategos_projects AS PERMISSIVE FOR ALL TO public USING ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id)))) WITH CHECK ((is_oracullo_admin((select auth.uid())) OR ((ws_environment(workspace_id) = 'estrategos'::environment_type) AND ws_env_allows_write((select auth.uid()), workspace_id))));

DROP POLICY IF EXISTS "memberships_select" ON public.memberships;
CREATE POLICY "memberships_select" ON public.memberships AS PERMISSIVE FOR SELECT TO public USING (((user_id = (select auth.uid())) OR is_guardian((select auth.uid())) OR is_env_staff((select auth.uid()), ws_environment(workspace_id))));

DROP POLICY IF EXISTS "memberships_write" ON public.memberships;
CREATE POLICY "memberships_write" ON public.memberships AS PERMISSIVE FOR ALL TO public USING (is_env_admin((select auth.uid()), ws_environment(workspace_id))) WITH CHECK (is_env_admin((select auth.uid()), ws_environment(workspace_id)));

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications AS PERMISSIVE FOR DELETE TO public USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = (select auth.uid())) OR is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "org_admin_all" ON public.organizations;
CREATE POLICY "org_admin_all" ON public.organizations AS PERMISSIVE FOR ALL TO public USING ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment))) WITH CHECK ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment)));

DROP POLICY IF EXISTS "org_select" ON public.organizations;
CREATE POLICY "org_select" ON public.organizations AS PERMISSIVE FOR SELECT TO public USING ((is_guardian((select auth.uid())) OR (EXISTS ( SELECT 1
   FROM user_environments
  WHERE ((user_environments.user_id = (select auth.uid())) AND (user_environments.environment = organizations.environment) AND (user_environments.role = ANY (ARRAY['admin'::environment_role, 'team'::environment_role]))))) OR (EXISTS ( SELECT 1
   FROM (memberships m
     JOIN workspaces w ON ((w.id = m.workspace_id)))
  WHERE ((m.user_id = (select auth.uid())) AND (w.organization_id = organizations.id))))));

DROP POLICY IF EXISTS "dates_select" ON public.strategic_dates;
CREATE POLICY "dates_select" ON public.strategic_dates AS PERMISSIVE FOR SELECT TO public USING (has_workspace_access((select auth.uid()), workspace_id));

DROP POLICY IF EXISTS "dates_team_all" ON public.strategic_dates;
CREATE POLICY "dates_team_all" ON public.strategic_dates AS PERMISSIVE FOR ALL TO public USING ((is_sharks_admin((select auth.uid())) OR is_sharks_team((select auth.uid()))));

DROP POLICY IF EXISTS "tma_admin_all" ON public.team_member_access;
CREATE POLICY "tma_admin_all" ON public.team_member_access AS PERMISSIVE FOR ALL TO public USING (is_sharks_admin((select auth.uid())));

DROP POLICY IF EXISTS "tma_team_read_own" ON public.team_member_access;
CREATE POLICY "tma_team_read_own" ON public.team_member_access AS PERMISSIVE FOR SELECT TO public USING ((((select auth.uid()) = user_id) OR is_sharks_admin((select auth.uid()))));

DROP POLICY IF EXISTS "user_env_select" ON public.user_environments;
CREATE POLICY "user_env_select" ON public.user_environments AS PERMISSIVE FOR SELECT TO public USING (((user_id = (select auth.uid())) OR is_guardian((select auth.uid())) OR is_env_staff((select auth.uid()), environment)));

DROP POLICY IF EXISTS "user_env_write" ON public.user_environments;
CREATE POLICY "user_env_write" ON public.user_environments AS PERMISSIVE FOR ALL TO public USING ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment))) WITH CHECK ((is_guardian((select auth.uid())) OR is_env_admin((select auth.uid()), environment)));

DROP POLICY IF EXISTS "users_admin_all" ON public.users;
CREATE POLICY "users_admin_all" ON public.users AS PERMISSIVE FOR ALL TO public USING (is_sharks_admin((select auth.uid())));

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users AS PERMISSIVE FOR SELECT TO public USING ((((select auth.uid()) = id) OR is_guardian((select auth.uid())) OR is_any_env_staff((select auth.uid()))));

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users AS PERMISSIVE FOR UPDATE TO public USING (((select auth.uid()) = id));

DROP POLICY IF EXISTS "workspace_delete" ON public.workspaces;
CREATE POLICY "workspace_delete" ON public.workspaces AS PERMISSIVE FOR DELETE TO public USING (is_env_admin((select auth.uid()), ws_environment(id)));

DROP POLICY IF EXISTS "workspace_insert" ON public.workspaces;
CREATE POLICY "workspace_insert" ON public.workspaces AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_env_admin((select auth.uid()), org_environment(organization_id)));

DROP POLICY IF EXISTS "workspace_select" ON public.workspaces;
CREATE POLICY "workspace_select" ON public.workspaces AS PERMISSIVE FOR SELECT TO public USING (ws_visible((select auth.uid()), id));

DROP POLICY IF EXISTS "workspace_update" ON public.workspaces;
CREATE POLICY "workspace_update" ON public.workspaces AS PERMISSIVE FOR UPDATE TO public USING (is_env_admin((select auth.uid()), ws_environment(id))) WITH CHECK (is_env_admin((select auth.uid()), org_environment(organization_id)));


