-- ==========================================
-- 025 — Sync multi-ambiente (Oracullo)
--
-- 1) calendar_integrations:
--    sync_mode: 'unified' (1 agenda, prefixo no
--    titulo) | 'split' (1 agenda Google por
--    ambiente, criadas na conexao)
--    env_calendar_ids: mapa ambiente->calendarId
--    env_auto_sync: toggle por ambiente
--
-- 2) calendar_sync_queue:
--    source + source_id generalizam action_id
--    (sharks_action | estrategos_meeting |
--    estrategos_implementation)
--
-- 3) Triggers de enqueue para as tabelas
--    estrategos, replicando o padrao validado
--    em actions (draft-skip, anti-loop, merge
--    ON CONFLICT, delete embutido).
--
-- 4) Trigger enqueue de actions ganha coluna
--    source p/ o worker rotear por ambiente.
-- ==========================================

-- ---------- 1) calendar_integrations ----------
ALTER TABLE calendar_integrations
  ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'unified'
    CHECK (sync_mode IN ('unified','split'));

ALTER TABLE calendar_integrations
  ADD COLUMN IF NOT EXISTS env_calendar_ids JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (env_calendar_ids = '{}'::jsonb OR (
      jsonb_typeof(env_calendar_ids) = 'object'
      AND env_calendar_ids ?& ARRAY['sharks_company','estrategos']
    ));

ALTER TABLE calendar_integrations
  ADD COLUMN IF NOT EXISTS env_auto_sync JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------- 2) fila generalizada ----------
ALTER TABLE calendar_sync_queue
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sharks_action'
    CHECK (source IN ('sharks_action','estrategos_meeting','estrategos_implementation'));

ALTER TABLE calendar_sync_queue
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- Backfill: itens existentes sao de actions
UPDATE calendar_sync_queue
   SET source_id = action_id
 WHERE source_id IS NULL AND action_id IS NOT NULL;

-- FK do link ganha cobertura multi-source via
-- coluna source (action_id permanece p/ actions;
-- source_id e o identificador universal).

-- ---------- 3) helper: existe integracao ativa cobrindo o ws ----------
-- (per-workspace OU pessoal global), com toggle
-- por ambiente respeitado quando aplicavel.
CREATE OR REPLACE FUNCTION fn_env_sync_enabled(integ_envs JSONB, env environment_type)
RETURNS BOOLEAN AS $$
  SELECT (integ_envs IS NULL OR integ_envs = '{}'::jsonb OR (integ_envs ->> env::text) IS DISTINCT FROM 'false');
$$ LANGUAGE sql IMMUTABLE;

-- ---------- 3a) trigger ACTIONS (atualiza p/ preencher source) ----------
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

  -- Integracao por-workspace
  IF EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id = ws
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
      AND fn_env_sync_enabled(ci.env_auto_sync, ws_environment(ws))
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, action_id, source, source_id, operation)
    VALUES (ws, aid, 'sharks_action', aid, op)
    ON CONFLICT (action_id, workspace_id) WHERE status = 'pending' DO UPDATE SET
      operation = CASE
        WHEN EXCLUDED.operation = 'delete' THEN 'delete'
        WHEN calendar_sync_queue.operation = 'create' THEN 'create'
        ELSE 'update'
      END,
      last_error = NULL;
  END IF;

  -- Pessoal global (fallback para qualquer ambiente)
  IF ws IS NOT NULL AND EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE ci.workspace_id IS NULL
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
      AND fn_env_sync_enabled(ci.env_auto_sync, ws_environment(ws))
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, action_id, source, source_id, operation)
    VALUES (ws, aid, 'sharks_action', aid, op)
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

-- ---------- 3b) trigger ESTRATEGOS (meetings + implementations) ----------
-- Mesmo padrao: status cancelado -> delete;
-- novo ativo -> create; edicao -> update.
CREATE OR REPLACE FUNCTION fn_enqueue_estrategos_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  sid UUID := COALESCE(NEW.id, OLD.id);
  src TEXT := CASE WHEN TG_TABLE_NAME = 'estrategos_meetings' THEN 'estrategos_meeting' ELSE 'estrategos_implementation' END;
  new_cancelled BOOLEAN := NEW.status = 'cancelled';
  old_active BOOLEAN;
  op TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  -- Anti-loop: nada mudou alem de sync_status/updated_at
  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND (to_jsonb(NEW) - 'sync_status' - 'updated_at') = (to_jsonb(OLD) - 'sync_status' - 'updated_at') THEN
    RETURN NULL;
  END IF;

  IF new_cancelled THEN
    op := 'delete';
  ELSIF TG_OP = 'INSERT' THEN
    op := 'create';
  ELSE
    op := 'update';
  END IF;

  IF EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE (ci.workspace_id = ws OR ci.workspace_id IS NULL)
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
      AND fn_env_sync_enabled(ci.env_auto_sync, ws_environment(ws))
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, source, source_id, operation)
    VALUES (ws, src, sid, op)
    ON CONFLICT (source, source_id) WHERE status = 'pending' AND source_id IS NOT NULL DO UPDATE SET
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

DROP TRIGGER IF EXISTS trg_em_calendar_sync ON estrategos_meetings;
CREATE TRIGGER trg_em_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON estrategos_meetings
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_estrategos_sync();

DROP TRIGGER IF EXISTS trg_ei_calendar_sync ON estrategos_implementations;
CREATE TRIGGER trg_ei_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON estrategos_implementations
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_estrategos_sync();

-- ---------- 3c) indice de conflito p/ multi-source ----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_csq_source_pending
  ON calendar_sync_queue(source, source_id)
  WHERE status = 'pending' AND source_id IS NOT NULL;

-- ---------- 3d) delete embutido (meetings/impl) ----------
CREATE OR REPLACE FUNCTION fn_enqueue_estrategos_sync_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE (ci.workspace_id = OLD.workspace_id OR ci.workspace_id IS NULL)
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, source, source_id, operation, google_event_id, integration_id)
    SELECT OLD.workspace_id,
           CASE WHEN TG_TABLE_NAME = 'estrategos_meetings' THEN 'estrategos_meeting' ELSE 'estrategos_implementation' END,
           NULL, 'delete', l.google_event_id, l.integration_id
    FROM calendar_event_links l
    WHERE l.source_id = OLD.id
      AND l.source = CASE WHEN TG_TABLE_NAME = 'estrategos_meetings' THEN 'estrategos_meeting' ELSE 'estrategos_implementation' END
      AND l.google_event_id IS NOT NULL;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_em_calendar_sync_delete ON estrategos_meetings;
CREATE TRIGGER trg_em_calendar_sync_delete
  BEFORE DELETE ON estrategos_meetings
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_estrategos_sync_delete();

DROP TRIGGER IF EXISTS trg_ei_calendar_sync_delete ON estrategos_implementations;
CREATE TRIGGER trg_ei_calendar_sync_delete
  BEFORE DELETE ON estrategos_implementations
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_estrategos_sync_delete();

-- ---------- 4) links multi-source ----------
ALTER TABLE calendar_event_links
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sharks_action'
    CHECK (source IN ('sharks_action','estrategos_meeting','estrategos_implementation')),
  ADD COLUMN IF NOT EXISTS source_id UUID;

UPDATE calendar_event_links
   SET source_id = action_id
 WHERE source_id IS NULL AND action_id IS NOT NULL;

-- Unicidade multi-source por integracao (indice completo:
-- source_id sempre preenchido — permite ON CONFLICT no upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cel_source_integration
  ON calendar_event_links(source, source_id, integration_id);

ALTER TABLE calendar_event_links ALTER COLUMN action_id DROP NOT NULL;
