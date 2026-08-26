-- ==========================================
-- 016 — Blindagem de escrita (auditoria RLS)
--
-- VULN 1 (CRITICA): integrations_select usava
--   (workspace_id IS NULL) OR has_workspace_access
--   -> QUALQUER usuario autenticado (incl. clientes)
--   lia a integracao GLOBAL, com access_token e
--   refresh_token da conta Google da Sharks.
--   CONFIRMADO AO VIVO: cliente leu o refresh_token.
--   Fix: SELECT e escrita em calendar_integrations
--   exclusivos de admin_sharks/sharks_team.
--
-- VULN 2: authenticated tinha grant UPDATE em TODAS
--   as colunas de users (incl. role). A policy
--   users_update_own restringe a linha propria mas
--   nao as colunas. Fix: column-level grants —
--   so full_name e avatar_url editaveis pelo propio
--   usuario; INSERT/DELETE/TRUNCATE revogados
--   (cadastros de user so via Edge Functions
--   service_role).
--
-- VULN 3: access_requests_insert reproduzia o bug da
--   015 (subquery em auth.users sem grant) para
--   usuarios Google -> INSERT 403. Fix: claim do JWT.
-- ==========================================

-- 1. calendar_integrations: so equipe Sharks
DROP POLICY IF EXISTS integrations_select ON calendar_integrations;
CREATE POLICY integrations_select ON calendar_integrations
  FOR SELECT TO authenticated
  USING (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()));

DROP POLICY IF EXISTS integrations_team_all ON calendar_integrations;
CREATE POLICY integrations_team_all ON calendar_integrations
  FOR ALL TO authenticated
  USING (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()))
  WITH CHECK (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()));

-- 2. users: column-level lockdown
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM authenticated;
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;

-- 3. access_requests_insert sem auth.users
DROP POLICY IF EXISTS access_requests_insert ON access_requests;
CREATE POLICY access_requests_insert ON access_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND (
      auth_provider IS DISTINCT FROM 'google'
      OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );
