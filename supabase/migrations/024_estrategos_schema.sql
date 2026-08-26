-- ==========================================
-- 024 — Schema Estrategos (gestao empresarial)
--
-- Projetos, reunioes e implantacoes de
-- sistemas. Cada tabela escopa por workspace
-- (que por sua vez pertence a uma organizacao
-- environment='estrategos').
--
-- sync_status espelha o ciclo do Google Sync
-- (not_synced/synced/modified_after_sync/
-- sync_error) para reunioes e implantacoes,
-- que sao os itens sincronizaveis.
-- ==========================================

-- ---------- Projetos ----------
CREATE TABLE IF NOT EXISTS estrategos_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','paused','completed','cancelled')),
  start_date DATE,
  end_date DATE,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ep_ws ON estrategos_projects(workspace_id, status);

-- ---------- Reunioes (sincronizavel) ----------
CREATE TABLE IF NOT EXISTS estrategos_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES estrategos_projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  meeting_date DATE NOT NULL,
  meeting_time TIME,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  location TEXT,
  attendees TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  sync_status TEXT NOT NULL DEFAULT 'not_synced'
    CHECK (sync_status IN ('not_synced','synced','modified_after_sync','sync_error')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_em_ws_date ON estrategos_meetings(workspace_id, meeting_date);

-- ---------- Implantacoes de sistemas (sincronizavel) ----------
CREATE TABLE IF NOT EXISTS estrategos_implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID REFERENCES estrategos_projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','blocked','completed','cancelled')),
  target_date DATE,
  completed_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'not_synced'
    CHECK (sync_status IN ('not_synced','synced','modified_after_sync','sync_error')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ei_ws ON estrategos_implementations(workspace_id, status);

-- ---------- updated_at automatico ----------
CREATE OR REPLACE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ep_touch ON estrategos_projects;
CREATE TRIGGER trg_ep_touch BEFORE UPDATE ON estrategos_projects
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_em_touch ON estrategos_meetings;
CREATE TRIGGER trg_em_touch BEFORE UPDATE ON estrategos_meetings
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ei_touch ON estrategos_implementations;
CREATE TRIGGER trg_ei_touch BEFORE UPDATE ON estrategos_implementations
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
