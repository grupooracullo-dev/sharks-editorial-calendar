-- Migration 007: Fix calendar_integrations RLS security
-- Problem: workspace_id IS NULL rows are accessible by ALL authenticated users
-- Fix: restrict global integration (workspace_id IS NULL) to admin_sharks/sharks_team only

-- Drop existing policies
DROP POLICY IF EXISTS "integrations_select" ON calendar_integrations;
DROP POLICY IF EXISTS "integrations_team_all" ON calendar_integrations;

-- SELECT: workspace members can see their workspace integrations
-- Global integration (workspace_id IS NULL) ONLY visible to admin_sharks/sharks_team
CREATE POLICY "integrations_select" ON calendar_integrations
  FOR SELECT USING (
    (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id))
    OR
    (workspace_id IS NULL AND (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())))
  );

-- INSERT/UPDATE/DELETE: team can manage global, workspace members can manage their own
CREATE POLICY "integrations_team_all" ON calendar_integrations
  FOR ALL USING (
    (workspace_id IS NOT NULL AND has_workspace_access(auth.uid(), workspace_id))
    OR
    (workspace_id IS NULL AND (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())))
  );
