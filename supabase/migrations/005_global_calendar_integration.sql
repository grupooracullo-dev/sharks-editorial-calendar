-- ==========================================
-- 005 — Global Calendar Integration
-- Allow workspace_id = NULL in calendar_integrations
-- for admin-level "sync everything" mode.
--
-- Design: trigger only handles per-workspace.
-- Global integration is handled by the worker
-- (processGlobalIntegration) which scans ALL
-- pending actions across ALL workspaces.
-- ==========================================

-- 1) Make workspace_id nullable
ALTER TABLE calendar_integrations
  DROP CONSTRAINT IF EXISTS calendar_integrations_workspace_id_fkey;

ALTER TABLE calendar_integrations
  ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE calendar_integrations
  ADD CONSTRAINT calendar_integrations_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- 2) Fix unique constraint: allow same action_id per different workspace
DROP INDEX IF EXISTS uq_csq_action_pending;
CREATE UNIQUE INDEX uq_csq_action_ws_pending
  ON calendar_sync_queue (action_id, workspace_id)
  WHERE status = 'pending';

-- 3) Trigger: per-workspace only (global handled by worker)
CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  aid UUID := COALESCE(NEW.id, OLD.id);
  op TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    op := 'delete';
  ELSE
    IF TG_OP = 'UPDATE'
       AND NEW.status = OLD.status
       AND (to_jsonb(NEW) - 'sync_status' - 'updated_at') = (to_jsonb(OLD) - 'sync_status' - 'updated_at') THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'draft' THEN
      RETURN NULL;
    END IF;

    IF NEW.status = 'draft' THEN
      op := 'delete';
    ELSIF TG_OP = 'INSERT' THEN
      op := 'create';
    ELSIF OLD.status = 'draft' THEN
      op := 'create';
    ELSIF NEW.status = 'cancelled' THEN
      op := 'delete';
    ELSE
      op := 'update';
    END IF;
  END IF;

  IF TG_OP != 'DELETE' AND EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id = ws
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, action_id, operation)
    VALUES (ws, aid, op)
    ON CONFLICT (action_id, workspace_id) WHERE status = 'pending' DO UPDATE SET
      operation = CASE
        WHEN EXCLUDED.operation = 'delete' THEN 'delete'
        WHEN calendar_sync_queue.operation = 'create' THEN 'create'
        ELSE 'update'
      END,
      last_error = NULL;
  END IF;

  -- Global integration: enqueue for ALL workspaces (not on DELETE - action is being removed)
  IF ws IS NOT NULL AND TG_OP != 'DELETE' AND EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id IS NULL
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, action_id, operation)
    SELECT w.id, aid, op
    FROM workspaces w
    WHERE w.is_active = true
      AND w.id != ws
    ON CONFLICT (action_id, workspace_id) WHERE status = 'pending' DO UPDATE SET
      operation = CASE
        WHEN EXCLUDED.operation = 'delete' THEN 'delete'
        WHEN calendar_sync_queue.operation = 'create' THEN 'create'
        ELSE 'update'
      END,
      last_error = NULL;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4) Fix RLS for nullable workspace_id
DROP POLICY IF EXISTS "integrations_select" ON calendar_integrations;
CREATE POLICY "integrations_select" ON calendar_integrations
  FOR SELECT USING (
    workspace_id IS NULL
    OR has_workspace_access(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "integrations_team_all" ON calendar_integrations;
CREATE POLICY "integrations_team_all" ON calendar_integrations
  FOR ALL USING (
    workspace_id IS NULL
    OR is_sharks_admin(auth.uid())
    OR is_sharks_team(auth.uid())
    OR has_workspace_access(auth.uid(), workspace_id)
  );
