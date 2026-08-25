-- ==========================================
-- 010 — Security & Integrity Fixes (Audit)
-- Fixes: RLS gaps, UNIQUE constraints,
-- audit trigger safety, missing policies
-- ==========================================

-- ══════════════════════════════════════════
-- 1) RLS FIX: notifications_insert was open
--    (any user could create notifications
--    for ANY user - spoofing/spam)
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR is_sharks_admin(auth.uid())
  OR is_sharks_team(auth.uid())
);

-- ══════════════════════════════════════════
-- 2) RLS FIX: org_select leaked all orgs
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "org_select" ON organizations;
CREATE POLICY "org_select" ON organizations FOR SELECT USING (
  is_sharks_admin(auth.uid())
  OR is_sharks_team(auth.uid())
  OR EXISTS (
    SELECT 1 FROM workspaces w
    JOIN memberships m ON m.workspace_id = w.id
    WHERE w.organization_id = organizations.id
      AND m.user_id = auth.uid()
  )
);

-- ══════════════════════════════════════════
-- 3) RLS FIX: tma_team_read_own was too broad
--    (all team could see all permissions)
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "tma_team_read_own" ON team_member_access;
CREATE POLICY "tma_team_read_own" ON team_member_access FOR SELECT USING (
  auth.uid() = user_id
  OR is_sharks_admin(auth.uid())
);

-- ══════════════════════════════════════════
-- 4) RLS FIX: no UPDATE policy on memberships
--    (role changes impossible via RLS)
-- ══════════════════════════════════════════
DROP POLICY IF EXISTS "memberships_admin_update" ON memberships;
CREATE POLICY "memberships_admin_update" ON memberships
  FOR UPDATE USING (is_sharks_admin(auth.uid()));

-- ══════════════════════════════════════════
-- 5) SCHEMA FIX: calendar_event_links had
--    UNIQUE(action_id) blocking global sync
--    (only 1 workspace could link per action)
-- ══════════════════════════════════════════
ALTER TABLE calendar_event_links
  DROP CONSTRAINT IF EXISTS calendar_event_links_action_id_key;
ALTER TABLE calendar_event_links
  DROP CONSTRAINT IF EXISTS calendar_event_links_action_id_ws_key;
ALTER TABLE calendar_event_links
  ADD CONSTRAINT calendar_event_links_action_id_ws_key
  UNIQUE (action_id, workspace_id);

-- ══════════════════════════════════════════
-- 6) TRIGGER FIX: create_audit_log not
--    SECURITY DEFINER (transaction rollback
--    risk if extended to client tables).
--    Also remove wrong COALESCE(NEW.id)
--    fallback used as workspace_id.
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, new_value)
    VALUES (NEW.workspace_id, auth.uid(), TG_TABLE_NAME, NEW.id, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, old_value, new_value)
    VALUES (NEW.workspace_id, auth.uid(), TG_TABLE_NAME, NEW.id, 'updated', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (workspace_id, user_id, entity_type, entity_id, action, old_value)
    VALUES (OLD.workspace_id, auth.uid(), TG_TABLE_NAME, OLD.id, 'deleted', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Audit must NEVER fail the parent operation
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ══════════════════════════════════════════
-- 7) TRIGGER FIX: create_workspace_chat_thread
--    not SECURITY DEFINER
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_workspace_chat_thread()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_threads (workspace_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ══════════════════════════════════════════
-- 8) INTEGRITY: missing composite UNIQUEs
-- ══════════════════════════════════════════
-- Dedup existing rows before adding constraints
DELETE FROM editorial_pillars a
USING editorial_pillars b
WHERE a.id > b.id AND a.workspace_id = b.workspace_id AND a.name = b.name;

ALTER TABLE editorial_pillars
  DROP CONSTRAINT IF EXISTS uq_pillar_ws_name;
ALTER TABLE editorial_pillars
  ADD CONSTRAINT uq_pillar_ws_name UNIQUE (workspace_id, name);

DELETE FROM channels a
USING channels b
WHERE a.id > b.id AND a.workspace_id = b.workspace_id AND a.name = b.name;

ALTER TABLE channels
  DROP CONSTRAINT IF EXISTS uq_channel_ws_name;
ALTER TABLE channels
  ADD CONSTRAINT uq_channel_ws_name UNIQUE (workspace_id, name);

-- ══════════════════════════════════════════
-- 9) INTEGRITY: range CHECK constraints
-- ══════════════════════════════════════════
ALTER TABLE editorial_pillars
  DROP CONSTRAINT IF EXISTS chk_percentage;
ALTER TABLE editorial_pillars
  ADD CONSTRAINT chk_percentage CHECK (percentage >= 0 AND percentage <= 100);

ALTER TABLE editorial_profiles
  DROP CONSTRAINT IF EXISTS chk_frequency;
ALTER TABLE editorial_profiles
  ADD CONSTRAINT chk_frequency CHECK (frequency_per_week > 0 AND frequency_per_week <= 14);

-- team_member_access.permission allowlist
ALTER TABLE team_member_access
  DROP CONSTRAINT IF EXISTS chk_permission;
ALTER TABLE team_member_access
  ADD CONSTRAINT chk_permission CHECK (
    permission IN ('calendar', 'campaigns', 'editorial', 'templates',
                   'history', 'chat', 'clients', 'integrations', 'team')
  );

-- ══════════════════════════════════════════
-- 10) TRIGGER: recreate sync trigger explicitly
--     (function was replaced 4x without
--     touching the trigger)
-- ══════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_actions_calendar_sync ON actions;
CREATE TRIGGER trg_actions_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON actions
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_calendar_sync();
