-- Migration 034: campaigns no Google Calendar sync
-- 1. source 'campaign' permitido na fila E nos links de eventos
ALTER TABLE calendar_sync_queue DROP CONSTRAINT calendar_sync_queue_source_check;
ALTER TABLE calendar_sync_queue ADD CONSTRAINT calendar_sync_queue_source_check
  CHECK (source IN ('sharks_action', 'estrategos_meeting', 'estrategos_implementation', 'campaign'));

ALTER TABLE calendar_event_links DROP CONSTRAINT calendar_event_links_source_check;
ALTER TABLE calendar_event_links ADD CONSTRAINT calendar_event_links_source_check
  CHECK (source IN ('sharks_action', 'estrategos_meeting', 'estrategos_implementation', 'campaign'));

-- 2. status de sync na campanha
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'not_synced';

-- 3. trigger: enfileira campanha visivel (active/draft com data) como
--    evento all-day no Google; pausar/concluir remove o evento.
--    Loop-break: updates que so tocaram sync_status/updated_at (escritos
--    pelo proprio motor de sync) nao re-enfileiram nada.
CREATE OR REPLACE FUNCTION fn_campaign_sync_queue() RETURNS trigger AS $$
DECLARE
  visible boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO calendar_sync_queue (workspace_id, source, source_id, operation)
    VALUES (OLD.workspace_id, 'campaign', OLD.id, 'delete')
    ON CONFLICT (source, source_id) WHERE status = 'pending' AND source_id IS NOT NULL
    DO UPDATE SET operation = EXCLUDED.operation, created_at = now();
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND
     NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id AND
     NEW.status IS NOT DISTINCT FROM OLD.status AND
     NEW.name IS NOT DISTINCT FROM OLD.name AND
     NEW.start_date IS NOT DISTINCT FROM OLD.start_date AND
     NEW.end_date IS NOT DISTINCT FROM OLD.end_date AND
     NEW.color IS NOT DISTINCT FROM OLD.color AND
     NEW.objective IS NOT DISTINCT FROM OLD.objective AND
     NEW.audience IS NOT DISTINCT FROM OLD.audience AND
     NEW.product IS NOT DISTINCT FROM OLD.product AND
     NEW.description IS NOT DISTINCT FROM OLD.description THEN
    RETURN NEW;
  END IF;

  visible := NEW.status IN ('active', 'draft') AND NEW.start_date IS NOT NULL;

  -- Toggle rapido pause<->ativa: o item pending anterior e flipado no
  -- lugar de colidir com uq_csq_source_pending (23505).
  IF visible THEN
    INSERT INTO calendar_sync_queue (workspace_id, source, source_id, operation)
    VALUES (NEW.workspace_id, 'campaign', NEW.id, 'create')
    ON CONFLICT (source, source_id) WHERE status = 'pending' AND source_id IS NOT NULL
    DO UPDATE SET operation = EXCLUDED.operation, created_at = now();
  ELSE
    INSERT INTO calendar_sync_queue (workspace_id, source, source_id, operation)
    VALUES (NEW.workspace_id, 'campaign', NEW.id, 'delete')
    ON CONFLICT (source, source_id) WHERE status = 'pending' AND source_id IS NOT NULL
    DO UPDATE SET operation = EXCLUDED.operation, created_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_campaigns_calendar_sync ON campaigns;
CREATE TRIGGER trg_campaigns_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_campaign_sync_queue();
