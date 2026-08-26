-- 027_actions_environment.sql
-- Adiciona coluna environment + novos tipos de ação para Estrategos

-- =============================================
-- 1. Nova coluna environment na tabela actions
-- =============================================
ALTER TABLE actions ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sharks_company';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'actions_environment_check'
  ) THEN
    ALTER TABLE actions ADD CONSTRAINT actions_environment_check
      CHECK (environment IN ('sharks_company', 'estrategos'));
  END IF;
END $$;

-- =============================================
-- 2. Novos valores no enum action_type
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'implementation') THEN
    ALTER TYPE action_type ADD VALUE 'implementation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'milestone') THEN
    ALTER TYPE action_type ADD VALUE 'milestone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'onboarding') THEN
    ALTER TYPE action_type ADD VALUE 'onboarding';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'review') THEN
    ALTER TYPE action_type ADD VALUE 'review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'follow_up') THEN
    ALTER TYPE action_type ADD VALUE 'follow_up';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'strategy') THEN
    ALTER TYPE action_type ADD VALUE 'strategy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'action_type') AND enumlabel = 'training') THEN
    ALTER TYPE action_type ADD VALUE 'training';
  END IF;
END $$;

-- =============================================
-- 3. Backfill: actions existentes = sharks_company
-- =============================================
UPDATE actions SET environment = 'sharks_company' WHERE environment IS NULL;

-- =============================================
-- 4. Índices
-- =============================================
CREATE INDEX IF NOT EXISTS idx_actions_environment ON actions(environment);
CREATE INDEX IF NOT EXISTS idx_actions_env_date ON actions(environment, action_date);
CREATE INDEX IF NOT EXISTS idx_actions_env_workspace ON actions(environment, workspace_id);

-- =============================================
-- 5. Comentário
-- =============================================
COMMENT ON COLUMN actions.environment IS 'Ambiente: sharks_company ou estrategos';

-- =============================================
-- 6. View para consultas por ambiente
-- =============================================
CREATE OR REPLACE VIEW actions_by_environment AS
SELECT
  a.*,
  w.name as workspace_name,
  o.environment as workspace_environment,
  u.full_name as responsible_name
FROM actions a
LEFT JOIN workspaces w ON w.id = a.workspace_id
LEFT JOIN organizations o ON o.id = w.organization_id
LEFT JOIN users u ON u.id = a.responsible_id;

GRANT SELECT ON actions_by_environment TO authenticated;
