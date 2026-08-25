-- ==========================================
-- 009 — Team Member Access Control
-- Fine-grained permissions + client assignment
-- ==========================================

-- 1) Permissions table
CREATE TABLE IF NOT EXISTS team_member_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT TRUE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, permission)
);

-- 2) Enable RLS
ALTER TABLE team_member_access ENABLE ROW LEVEL SECURITY;

-- 3) Admin can do everything
CREATE POLICY "tma_admin_all" ON team_member_access
  FOR ALL USING (is_sharks_admin(auth.uid()));

-- 4) Team members can read their own permissions
CREATE POLICY "tma_team_read_own" ON team_member_access
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_sharks_admin(auth.uid())
    OR is_sharks_team(auth.uid())
  );

-- 5) Create membership role 'manager' for team members assigned to clients
DO $$ BEGIN
  ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'manager';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6) Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tma_user ON team_member_access(user_id);
CREATE INDEX IF NOT EXISTS idx_tma_permission ON team_member_access(permission);

-- 7) Default permissions for existing team members
INSERT INTO team_member_access (user_id, permission, can_create, can_read, can_update, can_delete)
SELECT u.id, p.permission, p.can_create, p.can_read, p.can_update, p.can_delete
FROM users u
CROSS JOIN (VALUES
  ('calendar',   TRUE,  TRUE,  TRUE,  TRUE),
  ('campaigns',  TRUE,  TRUE,  TRUE,  TRUE),
  ('editorial',  TRUE,  TRUE,  TRUE,  TRUE),
  ('templates',  TRUE,  TRUE,  TRUE,  TRUE),
  ('history',    FALSE, TRUE,  FALSE, FALSE),
  ('chat',       TRUE,  TRUE,  TRUE,  FALSE),
  ('clients',    FALSE, TRUE,  FALSE, FALSE),
  ('integrations', FALSE, TRUE, FALSE, FALSE),
  ('team',       FALSE, TRUE,  FALSE, FALSE)
) AS p(permission, can_create, can_read, can_update, can_delete)
WHERE u.role IN ('admin_sharks', 'sharks_team')
ON CONFLICT (user_id, permission) DO NOTHING;
