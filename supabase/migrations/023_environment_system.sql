-- ==========================================
-- 023 — Sistema multi-ambiente (Oracullo)
--
-- Estrutura: Oracullo (guardiao) decide quem
-- acessa quais ambientes:
--   sharks_company -> marketing (Sharks Company)
--   estrategos     -> gestao empresarial (Estrategos)
--
-- 1) organizations.environment (workspace herda
--    o ambiente da sua organizacao)
-- 2) user_environments: matriz de acesso
--    (usuario x ambiente x papel)
-- 3) Helpers redesenhados com consciencia de
--    ambiente — TODAS as politicas RLS
--    existentes (actions, queue, chat, etc.)
--    passam a respeitar o isolamento sem
--    nenhuma alteracao adicional.
-- 4) Papel global 'oracullo_admin' + seed
-- ==========================================

-- [Executado em chamada separada]
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'oracullo_admin';

-- ---------- Tipos ----------
CREATE TYPE environment_type AS ENUM ('sharks_company', 'estrategos');
CREATE TYPE environment_role AS ENUM ('admin', 'team', 'client');

-- ---------- organizations.environment ----------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'sharks_company';

-- Seed: organizacao Estrategos
INSERT INTO organizations (id, name, environment)
VALUES ('00000000-0000-0000-0000-000000000002', 'Estrategos', 'estrategos')
ON CONFLICT (id) DO UPDATE SET environment = EXCLUDED.environment;

-- ---------- user_environments ----------
CREATE TABLE IF NOT EXISTS user_environments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment environment_type NOT NULL,
  role environment_role NOT NULL DEFAULT 'client',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, environment)
);

CREATE OR REPLACE FUNCTION fn_touch_user_environments()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_environments ON user_environments;
CREATE TRIGGER trg_touch_user_environments
  BEFORE UPDATE ON user_environments
  FOR EACH ROW EXECUTE FUNCTION fn_touch_user_environments();

-- ---------- Helpers com consciencia de ambiente ----------

CREATE OR REPLACE FUNCTION is_oracullo_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = user_uuid AND role = 'oracullo_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Papel do usuario em um ambiente (NULL se sem acesso)
CREATE OR REPLACE FUNCTION env_role(user_uuid UUID, env environment_type)
RETURNS environment_role AS $$
  SELECT role FROM user_environments WHERE user_id = user_uuid AND environment = env;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Acesso ao ambiente com um dos papeis exigidos
-- (oracullo_admin sempre passa)
CREATE OR REPLACE FUNCTION has_env_access(
  user_uuid UUID,
  env environment_type,
  roles environment_role[] DEFAULT ARRAY['admin','team','client']::environment_role[]
)
RETURNS BOOLEAN AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR (
      env IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_environments
        WHERE user_id = user_uuid
          AND environment = env
          AND role = ANY(roles)
      )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Ambiente de um workspace (via organizacao)
CREATE OR REPLACE FUNCTION ws_environment(ws_id UUID)
RETURNS environment_type AS $$
  SELECT o.environment
  FROM workspaces w
  JOIN organizations o ON o.id = w.organization_id
  WHERE w.id = ws_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Time/admin do ambiente daquele workspace pode escrever
CREATE OR REPLACE FUNCTION ws_env_allows_write(user_uuid UUID, ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT has_env_access(user_uuid, ws_environment(ws_id), ARRAY['admin','team']::environment_role[]);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------- REDEFINICAO dos helpers legados ----------
-- Semantica nova, mesma assinatura: todas as politicas
-- existentes passam a isolar por ambiente.
--   is_sharks_admin: oracullo OU admin do ambiente sharks
--   is_sharks_team:  oracullo OU admin/time do ambiente sharks
-- SEM fallback via users.role: revogar a linha em
-- user_environments revoga o acesso imediatamente.
-- (users.role permanece como papel primario p/ UX e
-- Edge Functions, mas NAO concede acesso por si so.)
-- Todos os caminhos de criacao de usuario passam a
-- gravar user_environments (backfill acima + Edge
-- Functions admin-* atualizadas nesta entrega).

CREATE OR REPLACE FUNCTION is_sharks_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR env_role(user_uuid, 'sharks_company') = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_sharks_team(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR env_role(user_uuid, 'sharks_company') IN ('admin', 'team');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Acesso a workspace: oracullo, time/admin do ambiente
-- da workspace, OU membership direta (cliente).
CREATE OR REPLACE FUNCTION has_workspace_access(user_uuid UUID, ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    is_oracullo_admin(user_uuid)
    OR ws_env_allows_write(user_uuid, ws_id)
    OR EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = user_uuid AND workspace_id = ws_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------- Backfill: usuarios atuais ----------
-- Todo usuario existente recebe acesso ao ambiente
-- sharks conforme o papel global atual (paridade total).
INSERT INTO user_environments (user_id, environment, role)
SELECT
  u.id,
  'sharks_company',
  CASE u.role
    WHEN 'admin_sharks' THEN 'admin'::environment_role
    WHEN 'sharks_team'  THEN 'team'::environment_role
    ELSE 'client'::environment_role
  END
FROM users u
ON CONFLICT (user_id, environment) DO NOTHING;

-- Admin Oracullo: grupo.oracullo@gmail.com ganha os dois ambientes
INSERT INTO user_environments (user_id, environment, role)
SELECT u.id, e.environment, 'admin'::environment_role
FROM users u
CROSS JOIN (VALUES ('sharks_company'::environment_type), ('estrategos'::environment_type)) AS e(environment)
WHERE lower(u.email) = 'grupo.oracullo@gmail.com'
  AND u.role = 'oracullo_admin'
ON CONFLICT (user_id, environment) DO UPDATE SET role = 'admin';

-- ---------- RLS: user_environments ----------
ALTER TABLE user_environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_env_select ON user_environments;
CREATE POLICY user_env_select ON user_environments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_oracullo_admin(auth.uid()));

DROP POLICY IF EXISTS user_env_admin_all ON user_environments;
CREATE POLICY user_env_admin_all ON user_environments
  FOR ALL TO authenticated
  USING (is_oracullo_admin(auth.uid()))
  WITH CHECK (is_oracullo_admin(auth.uid()));

-- ---------- workspaces: leitura por ambiente ----------
-- Time/admin de um ambiente enxerga as workspaces da
-- propria organizacao (a policy antiga exigia membership).
DROP POLICY IF EXISTS workspace_select ON workspaces;
CREATE POLICY workspace_select ON workspaces FOR SELECT USING (
  is_sharks_admin(auth.uid())
  OR ws_env_allows_write(auth.uid(), id)
  OR id IN (SELECT get_user_workspaces(auth.uid()))
);

-- ---------- access_requests: ambiente solicitado ----------
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS requested_environment environment_type NOT NULL DEFAULT 'sharks_company';

-- ---------- Realtime ----------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_environments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Grants minimos ----------
GRANT SELECT ON user_environments TO authenticated;
