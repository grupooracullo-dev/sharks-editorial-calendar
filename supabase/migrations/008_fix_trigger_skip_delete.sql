-- ==========================================
-- 008 — Fix trigger: skip INSERT on DELETE
--
-- The fn_enqueue_calendar_sync trigger was
-- inserting into calendar_sync_queue on DELETE,
-- but the action row is already removed by
-- the AFTER DELETE trigger, violating FK.
-- FIX: guard all INSERTs with TG_OP != 'DELETE'
-- ==========================================

CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  aid UUID := COALESCE(NEW.id, OLD.id);
  op TEXT;
BEGIN
  -- DELETE: nothing to enqueue, action is gone
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  -- INSERT de rascunho: nunca sincroniza
  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

  -- Guard anti-loop: worker writes (only sync_status changed) => skip
  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND (to_jsonb(NEW) - 'sync_status' - 'updated_at') = (to_jsonb(OLD) - 'sync_status' - 'updated_at') THEN
    RETURN NULL;
  END IF;

  -- Draft edits stay local
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

  -- Per-workspace enqueue
  IF EXISTS (
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

  -- Global integration: enqueue for ALL OTHER workspaces
  IF ws IS NOT NULL AND EXISTS (
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
