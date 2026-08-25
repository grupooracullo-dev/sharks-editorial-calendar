-- ==========================================
-- 011 — Access Requests (self-service onboarding)
-- Allows non-registered users to request access.
-- Admin approves → creates auth.users + profile + membership.
-- ==========================================

CREATE TABLE IF NOT EXISTS access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_role TEXT NOT NULL DEFAULT 'client'
    CHECK (requested_role IN ('client', 'sharks_team', 'admin_sharks')),
  temp_password TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one PENDING request per email at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_request_pending_email
  ON access_requests (lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON access_requests (status, created_at DESC);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- 1) Anyone (incl. anon) can submit a pending request
DROP POLICY IF EXISTS "access_requests_insert" ON access_requests;
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND lower(email) = lower(email)
    AND full_name IS NOT NULL
  );

-- 2) Admin can do anything
DROP POLICY IF EXISTS "access_requests_admin_all" ON access_requests;
CREATE POLICY "access_requests_admin_all" ON access_requests
  FOR ALL USING (is_sharks_admin(auth.uid()));

-- 3) The requester can read their OWN rows (matched by email)
DROP POLICY IF EXISTS "access_requests_select_own" ON access_requests;
CREATE POLICY "access_requests_select_own" ON access_requests
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- 4) Auto-update updated_at
DROP TRIGGER IF EXISTS update_access_requests_updated_at ON access_requests;
CREATE TRIGGER update_access_requests_updated_at
  BEFORE UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5) RLS on audit_logs INSERT: allow service role + SECURITY DEFINER functions
--    so that admin-approve Edge Function can insert without RLS issues.
--    (audit_logs already has policy audit_insert for admin/team)
