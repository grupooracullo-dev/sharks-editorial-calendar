-- ==========================================
-- 036: Histórico de acessos por ambiente
-- Registra concessões/revogações/alterações de papel
-- exibidas na página "Acessos por Ambiente" (Oracullo).
-- ==========================================

CREATE TABLE IF NOT EXISTS access_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment environment_type NOT NULL,
  env_role environment_role,
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked', 'role_changed')),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  workspace_name TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_hist_created ON access_histories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_hist_user ON access_histories(user_id);

ALTER TABLE access_histories ENABLE ROW LEVEL SECURITY;

-- Guardião (Oracullo) vê tudo; admin de ambiente vê o próprio ambiente
DROP POLICY IF EXISTS "access_hist_select" ON access_histories;
CREATE POLICY "access_hist_select" ON access_histories FOR SELECT USING (
  is_guardian(auth.uid()) OR is_env_admin(auth.uid(), environment)
);

-- Inserção pelo próprio gestor (página Acessos por Ambiente)
DROP POLICY IF EXISTS "access_hist_insert" ON access_histories;
CREATE POLICY "access_hist_insert" ON access_histories FOR INSERT WITH CHECK (
  is_guardian(auth.uid()) OR is_env_admin(auth.uid(), environment)
);
