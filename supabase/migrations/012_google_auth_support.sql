-- ==========================================
-- 012 — Google OAuth login support
-- 1) auth_provider marker on access_requests
-- 2) Tightened INSERT policy: a 'google'
--    provider claim must match the signed-in
--    session email (anti-spoof at DB level)
-- 3) Realtime publication (approval flow)
-- 4) Service-role helper to find auth user
--    by email (replaces fragile listUsers
--    pagination in the approve function)
-- ==========================================

-- 1) auth_provider
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS auth_provider TEXT;

ALTER TABLE access_requests
  DROP CONSTRAINT IF EXISTS chk_access_requests_auth_provider;
ALTER TABLE access_requests
  ADD CONSTRAINT chk_access_requests_auth_provider
  CHECK (auth_provider IS NULL OR auth_provider IN ('google'));

-- 2) INSERT policy: anonymous form keeps working (auth_provider NULL);
--    'google' requires a signed-in session with the SAME email.
DROP POLICY IF EXISTS "access_requests_insert" ON access_requests;
CREATE POLICY "access_requests_insert" ON access_requests
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND (
      auth_provider IS DISTINCT FROM 'google'
      OR (
        auth.uid() IS NOT NULL
        AND lower(email) = lower(
          COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), '')
        )
      )
    )
  );

-- 3) Realtime: required for the "aguardando aprovação" live screen
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE access_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Service-role helper (SECURITY DEFINER, service_role only)
CREATE OR REPLACE FUNCTION admin_find_auth_user_by_email(p_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION admin_find_auth_user_by_email(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_find_auth_user_by_email(TEXT)
  TO service_role;

-- 5) "Read own request" must match email case-insensitively:
--    Google may return a different casing than the one typed on the form.
DROP POLICY IF EXISTS "access_requests_select_own" ON access_requests;
CREATE POLICY "access_requests_select_own" ON access_requests
  FOR SELECT USING (
    lower(email) = lower(
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), '')
    )
  );
