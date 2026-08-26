-- 032_parametric_rls.sql
-- Estrutura ideal: autorização via user_environments (paramétrica por ambiente)
-- + users.is_guardian. Substitui checagens env-cegas (is_sharks_admin em workspaces)
-- por helpers paramétricos (is_env_admin/is_env_staff/ws_visible).

-- ============================================
-- 1. Coluna is_guardian + backfill
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guardian boolean NOT NULL DEFAULT false;
UPDATE users SET is_guardian = true WHERE email = 'grupo.oracullo@gmail.com';
UPDATE users SET is_guardian = false WHERE email <> 'grupo.oracullo@gmail.com';

-- ============================================
-- 2. Helpers paramétricos (SECURITY DEFINER p/ evitar recursão de RLS)
-- ============================================
CREATE OR REPLACE FUNCTION is_guardian(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = user_uuid AND (is_guardian OR role = 'oracullo_admin')
  );
$$;

-- Compat: redireciona para is_guardian
CREATE OR REPLACE FUNCTION is_oracullo_admin(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_guardian(user_uuid);
$$;

CREATE OR REPLACE FUNCTION is_env_admin(user_uuid uuid, env environment_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_guardian(user_uuid) OR (env_role(user_uuid, env) = 'admin') IS TRUE;
$$;

CREATE OR REPLACE FUNCTION is_env_staff(user_uuid uuid, env environment_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_guardian(user_uuid) OR (env_role(user_uuid, env) IN ('admin', 'team')) IS TRUE;
$$;

-- Environment da org/workspace (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION org_environment(org_id uuid)
RETURNS environment_type LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT environment FROM organizations WHERE id = org_id;
$$;

CREATE OR REPLACE FUNCTION ws_environment(ws_id uuid)
RETURNS environment_type LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT environment FROM organizations WHERE id = (SELECT organization_id FROM workspaces WHERE id = ws_id);
$$;

-- Visibilidade de workspace: staff do ambiente OU membro
CREATE OR REPLACE FUNCTION ws_visible(user_uuid uuid, ws_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    is_env_staff(user_uuid, ws_environment(ws_id)) IS TRUE
    OR EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = user_uuid AND workspace_id = ws_id
    );
$$;

-- Compat: helpers legados viram wrappers paramétricos
-- (is_sharks_admin deixa de ser env-cego: agora exige env do CONTEXTO)
CREATE OR REPLACE FUNCTION is_sharks_admin(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_env_admin(user_uuid, 'sharks_company');
$$;

CREATE OR REPLACE FUNCTION is_sharks_team(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_env_staff(user_uuid, 'sharks_company');
$$;

CREATE OR REPLACE FUNCTION is_estrategos_admin(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_env_admin(user_uuid, 'estrategos');
$$;

CREATE OR REPLACE FUNCTION is_estrategos_team(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_env_staff(user_uuid, 'estrategos');
$$;

-- ============================================
-- 3. RPC p/ WorkspaceContext: mapa id→environment
--    (SECURITY DEFINER: mata o join NULL do organizations RLS)
-- ============================================
CREATE OR REPLACE FUNCTION ws_env_map()
RETURNS TABLE (id uuid, environment environment_type)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT w.id, o.environment
  FROM workspaces w
  JOIN organizations o ON o.id = w.organization_id;
$$;

-- ============================================
-- 4. organizations: staff do ambiente OU membro de workspace da org
-- ============================================
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations
  FOR SELECT USING (
    is_guardian(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_environments
      WHERE user_id = auth.uid()
        AND environment = organizations.environment
        AND role IN ('admin', 'team')
    )
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = auth.uid() AND w.organization_id = organizations.id
    )
  );

-- ============================================
-- 5. workspaces: isolamento estrutural por ambiente
-- ============================================
DROP POLICY IF EXISTS workspace_select ON workspaces;
CREATE POLICY workspace_select ON workspaces
  FOR SELECT USING (ws_visible(auth.uid(), id));

DROP POLICY IF EXISTS workspace_insert ON workspaces;
CREATE POLICY workspace_insert ON workspaces
  FOR INSERT WITH CHECK (is_env_admin(auth.uid(), org_environment(organization_id)));

DROP POLICY IF EXISTS workspace_update ON workspaces;
CREATE POLICY workspace_update ON workspaces
  FOR UPDATE
  USING (is_env_admin(auth.uid(), ws_environment(id)))
  WITH CHECK (is_env_admin(auth.uid(), org_environment(organization_id)));

DROP POLICY IF EXISTS workspace_delete ON workspaces;
CREATE POLICY workspace_delete ON workspaces
  FOR DELETE USING (is_env_admin(auth.uid(), ws_environment(id)));

-- ============================================
-- 6. actions: escrita escopada ao ambiente DO workspace
-- ============================================
DROP POLICY IF EXISTS actions_select ON actions;
CREATE POLICY actions_select ON actions
  FOR SELECT USING (ws_visible(auth.uid(), workspace_id));

DROP POLICY IF EXISTS actions_team_insert ON actions;
CREATE POLICY actions_team_insert ON actions
  FOR INSERT WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));

DROP POLICY IF EXISTS actions_team_update ON actions;
CREATE POLICY actions_team_update ON actions
  FOR UPDATE
  USING (ws_env_allows_write(auth.uid(), workspace_id))
  WITH CHECK (ws_env_allows_write(auth.uid(), workspace_id));

DROP POLICY IF EXISTS actions_team_delete ON actions;
CREATE POLICY actions_team_delete ON actions
  FOR DELETE USING (ws_env_allows_write(auth.uid(), workspace_id));

-- ============================================
-- 7. calendar_integrations: dono, guardião ou admin do ambiente
-- ============================================
DROP POLICY IF EXISTS integrations_select ON calendar_integrations;
CREATE POLICY integrations_select ON calendar_integrations
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_guardian(auth.uid())
    OR (
      user_id IS NULL AND workspace_id IS NOT NULL
      AND is_env_staff(auth.uid(), ws_environment(workspace_id))
    )
  );

DROP POLICY IF EXISTS integrations_team_all ON calendar_integrations;
CREATE POLICY integrations_team_all ON calendar_integrations
  FOR ALL
  USING (
    user_id = auth.uid()
    OR is_guardian(auth.uid())
    OR (
      user_id IS NULL AND workspace_id IS NOT NULL
      AND is_env_admin(auth.uid(), ws_environment(workspace_id))
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_guardian(auth.uid())
    OR (
      user_id IS NULL AND workspace_id IS NOT NULL
      AND is_env_admin(auth.uid(), ws_environment(workspace_id))
    )
  );

-- ============================================
-- 8. memberships: gestão por admin do ambiente / auto-leitura
-- ============================================
DROP POLICY IF EXISTS memberships_select ON memberships;
CREATE POLICY memberships_select ON memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_guardian(auth.uid())
    OR is_env_staff(auth.uid(), ws_environment(workspace_id))
  );

DROP POLICY IF EXISTS memberships_write ON memberships;
CREATE POLICY memberships_write ON memberships
  FOR ALL
  USING (is_env_admin(auth.uid(), ws_environment(workspace_id)))
  WITH CHECK (is_env_admin(auth.uid(), ws_environment(workspace_id)));

-- user_environments: leitura própria + gestão guardião/admin do ambiente
DROP POLICY IF EXISTS user_env_select ON user_environments;
CREATE POLICY user_env_select ON user_environments
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_guardian(auth.uid())
    OR is_env_admin(auth.uid(), environment)
  );

DROP POLICY IF EXISTS user_env_write ON user_environments;
CREATE POLICY user_env_write ON user_environments
  FOR ALL
  USING (is_guardian(auth.uid()) OR is_env_admin(auth.uid(), environment))
  WITH CHECK (is_guardian(auth.uid()) OR is_env_admin(auth.uid(), environment));

-- ============================================
-- 9. Remover políticas legadas env-cegas que,
--    por OR, anulariam o isolamento paramétrico
-- ============================================
DROP POLICY IF EXISTS workspace_admin_insert ON workspaces;
DROP POLICY IF EXISTS workspace_admin_update ON workspaces;
DROP POLICY IF EXISTS workspace_admin_delete ON workspaces;
DROP POLICY IF EXISTS memberships_admin_insert ON memberships;
DROP POLICY IF EXISTS memberships_admin_update ON memberships;
DROP POLICY IF EXISTS memberships_admin_delete ON memberships;
DROP POLICY IF EXISTS user_env_admin_all ON user_environments;

-- organizations: escrita paramétrica (era is_sharks_admin env-cego)
DROP POLICY IF EXISTS org_admin_all ON organizations;
CREATE POLICY org_admin_all ON organizations
  FOR ALL
  USING (is_guardian(auth.uid()) OR is_env_admin(auth.uid(), organizations.environment))
  WITH CHECK (is_guardian(auth.uid()) OR is_env_admin(auth.uid(), organizations.environment));

-- access_requests: admin de QUALQUER ambiente (era is_sharks_admin)
DROP POLICY IF EXISTS access_requests_admin_all ON access_requests;
CREATE POLICY access_requests_admin_all ON access_requests
  FOR ALL
  USING (
    is_guardian(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_environments ue
      WHERE ue.user_id = auth.uid() AND ue.role = 'admin'
    )
  )
  WITH CHECK (
    is_guardian(auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_environments ue
      WHERE ue.user_id = auth.uid() AND ue.role = 'admin'
    )
  );
