-- ==========================================
-- 004 — EDITORIAL ENGINE v2
-- 1. Realtime para strategic_dates
-- 2. Gate de rascunhos no sync Google
--    (rascunho é interno; sincroniza a partir de briefing)
-- 3. Guard anti-loop no trigger de sync
--    (escritas do próprio worker não re-enfileiram)
-- 4. RPC membros do workspace (cockpit de aprovação)
-- ==========================================

-- 1) Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE strategic_dates;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) + 3) Trigger de enqueue reescrito
CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  aid UUID := COALESCE(NEW.id, OLD.id);
  op TEXT;
BEGIN
  -- INSERT de rascunho: nunca sincroniza
  IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    op := 'delete';
  ELSE
    -- Guard anti-loop: escritas do worker (apenas sync_status muda) nao re-enfileiram
    IF TG_OP = 'UPDATE'
       AND NEW.status = OLD.status
       AND (to_jsonb(NEW) - 'sync_status' - 'updated_at') = (to_jsonb(OLD) - 'sync_status' - 'updated_at') THEN
      RETURN NULL;
    END IF;

    -- Edicoes entre rascunhos ficam internas
    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'draft' THEN
      RETURN NULL;
    END IF;

    IF NEW.status = 'draft' THEN
      op := 'delete';                    -- rebaixado a rascunho: remove do Google
    ELSIF TG_OP = 'INSERT' THEN
      op := 'create';
    ELSIF OLD.status = 'draft' THEN
      op := 'create';                    -- promovido de rascunho: cria evento
    ELSIF NEW.status = 'cancelled' THEN
      op := 'delete';
    ELSE
      op := 'update';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id = ws
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO calendar_sync_queue (workspace_id, action_id, operation)
  VALUES (ws, aid, op)
  ON CONFLICT (action_id) WHERE status = 'pending' DO UPDATE SET
    operation = CASE
      WHEN EXCLUDED.operation = 'delete' THEN 'delete'
      WHEN calendar_sync_queue.operation = 'create' THEN 'create'
      ELSE 'update'
    END,
    last_error = NULL;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4) Membros do workspace p/ cockpit (RLS-friendly)
CREATE OR REPLACE FUNCTION get_workspace_members(ws UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, role user_role)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.id, u.full_name, u.role
  FROM memberships m
  JOIN users u ON u.id = m.user_id
  WHERE m.workspace_id = ws
  ORDER BY u.full_name;
$$;

REVOKE ALL ON FUNCTION get_workspace_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_workspace_members(UUID) TO authenticated;
