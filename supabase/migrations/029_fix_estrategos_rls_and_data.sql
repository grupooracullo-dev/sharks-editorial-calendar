-- 029_fix_estrategos_rls_and_data.sql
-- Corrige RLS para suportar Estrategos + dados de usuario

-- =============================================
-- 1. Helper functions para Estrategos
-- =============================================
CREATE OR REPLACE FUNCTION is_estrategos_admin(user_uuid uuid)
RETURNS boolean AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR env_role(user_uuid, 'estrategos') = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_estrategos_team(user_uuid uuid)
RETURNS boolean AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR env_role(user_uuid, 'estrategos') IN ('admin', 'team');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 2. Atualizar helpers Sharks para aceitar Estrategos tambem
-- (is_sharks_admin e is_sharks_team ja incluem oracullo_admin,
--  mas precisamos que funcionem para team members do Estrategos
--  que tenham acesso cross-environment)
-- =============================================

-- =============================================
-- 3. Actions: corrigir RLS INSERT/UPDATE/DELETE para Estrategos
-- =============================================
DROP POLICY IF EXISTS actions_team_insert ON actions;
CREATE POLICY actions_team_insert ON actions
  FOR INSERT
  WITH CHECK (
    is_sharks_admin(auth.uid())
    OR is_sharks_team(auth.uid())
    OR is_estrategos_admin(auth.uid())
    OR is_estrategos_team(auth.uid())
  );

DROP POLICY IF EXISTS actions_team_update ON actions;
CREATE POLICY actions_team_update ON actions
  FOR UPDATE
  USING (
    is_sharks_admin(auth.uid())
    OR is_sharks_team(auth.uid())
    OR is_estrategos_admin(auth.uid())
    OR is_estrategos_team(auth.uid())
  );

DROP POLICY IF EXISTS actions_team_delete ON actions;
CREATE POLICY actions_team_delete ON actions
  FOR DELETE
  USING (
    is_sharks_admin(auth.uid())
    OR is_sharks_team(auth.uid())
    OR is_estrategos_admin(auth.uid())
    OR is_estrategos_team(auth.uid())
  );

-- =============================================
-- 4. Calendar integrations: corrigir RLS para Estrategos
-- =============================================
DROP POLICY IF EXISTS integrations_select ON calendar_integrations;
CREATE POLICY integrations_select ON calendar_integrations
  FOR SELECT
  USING (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
     OR is_estrategos_admin(auth.uid()) OR is_estrategos_team(auth.uid()))
    AND (is_sharks_admin(auth.uid()) OR is_estrategos_admin(auth.uid()) OR (user_id IS NULL) OR (user_id = auth.uid()))
  );

DROP POLICY IF EXISTS integrations_team_all ON calendar_integrations;
CREATE POLICY integrations_team_all ON calendar_integrations
  FOR ALL
  USING (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
     OR is_estrategos_admin(auth.uid()) OR is_estrategos_team(auth.uid()))
    AND (is_sharks_admin(auth.uid()) OR is_estrategos_admin(auth.uid()) OR (user_id IS NULL) OR (user_id = auth.uid()))
  )
  WITH CHECK (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
     OR is_estrategos_admin(auth.uid()) OR is_estrategos_team(auth.uid()))
    AND (is_sharks_admin(auth.uid()) OR is_estrategos_admin(auth.uid()) OR (user_id IS NULL) OR (user_id = auth.uid()))
  );

-- =============================================
-- 5. Corrigir dados do usuario estrategosonline
-- =============================================
-- Promover para oracullo_admin (admin de ambos ambientes)
UPDATE users SET role = 'oracullo_admin'
WHERE email = 'estrategosonline@gmail.com';

-- Garantir user_environments correto
DELETE FROM user_environments WHERE user_id = (
  SELECT id FROM users WHERE email = 'estrategosonline@gmail.com'
);

INSERT INTO user_environments (user_id, environment, role)
SELECT id, 'estrategos', 'admin' FROM users WHERE email = 'estrategosonline@gmail.com'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

INSERT INTO user_environments (user_id, environment, role)
SELECT id, 'sharks_company', 'admin' FROM users WHERE email = 'estrategosonline@gmail.com'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

-- =============================================
-- 6. Membros de Estrategos workspace
-- =============================================
-- Garantir que estrategosonline tem membership no workspace Estrategos ativo
DO $$
DECLARE
  v_user_id uuid;
  v_ws_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE email = 'estrategosonline@gmail.com';
  SELECT id INTO v_ws_id FROM workspaces
  WHERE organization_id = '00000000-0000-0000-0000-000000000002' AND is_active = true
  LIMIT 1;

  IF v_user_id IS NOT NULL AND v_ws_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, workspace_id, role)
    VALUES (v_user_id, v_ws_id, 'manager')
    ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'manager';
  END IF;
END $$;
