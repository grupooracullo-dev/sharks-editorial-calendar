-- ==========================================
-- 014 — Sync DELETE de acoes (eventos orfaos)
-- Bug: trigger ignorava DELETE (RETURN NULL).
-- O CASCADE apagava calendar_event_links antes
-- do worker rodar, perdendo o google_event_id.
-- Resultado: evento ficava orfao no Google
-- Calendar para sempre.
--
-- Fix: trigger BEFORE DELETE captura o
-- google_event_id de cada link ANTES do
-- cascade e enfileira item auto-contido:
--   action_id = NULL (sobrevive ao cascade;
--     FK do calendar_sync_queue e ON DELETE
--     CASCADE, mas NULL nunca cascateia)
--   google_event_id embutido na propria fila
-- O worker processa o delete sem precisar da
-- action nem do link.
-- ==========================================

ALTER TABLE calendar_sync_queue
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- So enfileira se existe integracao ativa (per-workspace ou global)
  IF EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE (ci.workspace_id = OLD.workspace_id OR ci.workspace_id IS NULL)
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    -- Captura os links ANTES do FK cascade apaga-los.
    -- Um item por link (cada link = um evento Google).
    INSERT INTO calendar_sync_queue (workspace_id, action_id, operation, google_event_id)
    SELECT OLD.workspace_id, NULL, 'delete', l.google_event_id
    FROM calendar_event_links l
    WHERE l.action_id = OLD.id
      AND l.google_event_id IS NOT NULL;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_actions_calendar_sync_delete ON actions;
CREATE TRIGGER trg_actions_calendar_sync_delete
  BEFORE DELETE ON actions
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_calendar_sync_delete();
