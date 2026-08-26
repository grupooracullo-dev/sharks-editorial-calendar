-- ==========================================
-- 013 — Fix global trigger enqueue
-- Bug: ramo global fazia INSERT ... SELECT
-- w.id != ws (fan-out para OUTROS workspaces),
-- mas com apenas 1 workspace ativo retornava 0 linhas.
-- Resultado: acoes do workspace ativo nunca
-- entravam na fila quando is_connected=false
-- e dependiam do fallback global.
--
-- Fix: enfileira (ws, aid) quando global existe,
-- ON CONFLICT mescla com ramo per-workspace
-- (quando ambos conectados, segunda insercao
-- apenas atualiza operation).
-- ==========================================

CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  aid UUID := COALESCE(NEW.id, OLD.id);
  op TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

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

  -- Per-workspace integration
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

  -- Global integration (workspace_id IS NULL): fallback para qualquer workspace.
  -- Enfileira (ws, aid) quando global esta ativa. ON CONFLICT mescla caso
  -- o ramo per-workspace ja tenha enfileirado o mesmo (ws, aid).
  IF ws IS NOT NULL AND EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id IS NULL
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

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_actions_calendar_sync ON actions;
CREATE TRIGGER trg_actions_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON actions
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_calendar_sync();
