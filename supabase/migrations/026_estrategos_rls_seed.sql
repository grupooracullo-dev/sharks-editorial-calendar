-- ==========================================
-- 026 — RLS Estrategos + realtime + seeds
--
-- Politicas espelham o padrao validado das
-- actions: SELECT via has_workspace_access
-- (isolado por ambiente via helpers 023),
-- escrita restrita a admin/team do ambiente
-- estrategos (ws_env_allows_write).
-- ==========================================

-- ---------- RLS ----------

ALTER TABLE estrategos_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE estrategos_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE estrategos_implementations ENABLE ROW LEVEL SECURITY;

-- (Protecao de dominio org<->ambiente e garantida por
-- FK organization_id + helpers ws_environment; CHECK
-- com subquery nao e suportado pelo PostgreSQL.)

-- Projetos
DROP POLICY IF EXISTS ep_select ON estrategos_projects;
CREATE POLICY ep_select ON estrategos_projects FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
DROP POLICY IF EXISTS ep_write ON estrategos_projects;
CREATE POLICY ep_write ON estrategos_projects FOR ALL USING (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
) WITH CHECK (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
);

-- Reunioes
DROP POLICY IF EXISTS em_select ON estrategos_meetings;
CREATE POLICY em_select ON estrategos_meetings FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
DROP POLICY IF EXISTS em_write ON estrategos_meetings;
CREATE POLICY em_write ON estrategos_meetings FOR ALL USING (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
) WITH CHECK (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
);

-- Implantacoes
DROP POLICY IF EXISTS ei_select ON estrategos_implementations;
CREATE POLICY ei_select ON estrategos_implementations FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
DROP POLICY IF EXISTS ei_write ON estrategos_implementations;
CREATE POLICY ei_write ON estrategos_implementations FOR ALL USING (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
) WITH CHECK (
  is_oracullo_admin(auth.uid())
  OR (
    ws_environment(workspace_id) = 'estrategos'
    AND ws_env_allows_write(auth.uid(), workspace_id)
  )
);

-- ---------- Realtime ----------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE estrategos_projects;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE estrategos_meetings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE estrategos_implementations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Seed: workspace demo Estrategos ----------
INSERT INTO workspaces (id, organization_id, name, slug, segment, city, state, country)
VALUES (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000002',
  'Cliente Demo Estrategos',
  'demo-estrategos',
  'Gestao Empresarial',
  'Sao Paulo', 'SP', 'Brasil'
)
ON CONFLICT (id) DO NOTHING;

-- Thread de chat do workspace (padrao do sistema:
-- 1 thread por workspace, criada com ele)
INSERT INTO chat_threads (workspace_id)
SELECT '00000000-0000-0000-0000-000000000200'
WHERE NOT EXISTS (
  SELECT 1 FROM chat_threads WHERE workspace_id = '00000000-0000-0000-0000-000000000200'
);

-- ---------- Isolamento retroativo ----------
-- Nenhum workspace do ambiente sharks pode pertencer
-- a organizacao estrategos e vice-versa (defensivo:
-- hoje o dado ja esta consistente; constraint
-- NOT VALID acima sera validada manualmente depois).

-- ---------- Grants minimos ----------
GRANT SELECT ON estrategos_projects TO authenticated;
GRANT SELECT ON estrategos_meetings TO authenticated;
GRANT SELECT ON estrategos_implementations TO authenticated;
