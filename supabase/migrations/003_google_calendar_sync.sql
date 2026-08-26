-- ==========================================
-- GOOGLE CALENDAR SYNC ENGINE
-- Queue-based incremental sync infrastructure
-- ==========================================

-- Extra integration fields
ALTER TABLE calendar_integrations
  ADD COLUMN IF NOT EXISTS google_account_email TEXT,
  ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- ==========================================
-- SYNC QUEUE
-- Actions pending push to Google Calendar.
-- Rapid edits collapse into a single row
-- (partial unique index per action).
-- ==========================================

CREATE TABLE IF NOT EXISTS calendar_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_id UUID REFERENCES actions(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_csq_ws_pending
  ON calendar_sync_queue(workspace_id, created_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_csq_action_pending
  ON calendar_sync_queue(action_id)
  WHERE status = 'pending';

ALTER TABLE calendar_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select" ON calendar_sync_queue FOR SELECT USING (
  has_workspace_access(auth.uid(), workspace_id)
);
CREATE POLICY "queue_team_all" ON calendar_sync_queue FOR ALL USING (
  is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid())
);

-- ==========================================
-- AUTO-ENQUEUE TRIGGER
-- Every action change is queued automatically
-- when the workspace has an active integration.
-- cancelled -> delete event; insert -> create;
-- update -> update.
-- ==========================================

CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync()
RETURNS TRIGGER AS $$
DECLARE
  ws UUID := COALESCE(NEW.workspace_id, OLD.workspace_id);
  aid UUID := COALESCE(NEW.id, OLD.id);
  op TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    op := 'delete';
  ELSIF NEW.status = 'cancelled' THEN
    op := 'delete';
  ELSIF TG_OP = 'INSERT' THEN
    op := 'create';
  ELSE
    op := 'update';
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

DROP TRIGGER IF EXISTS trg_actions_calendar_sync ON actions;
CREATE TRIGGER trg_actions_calendar_sync
AFTER INSERT OR UPDATE OR DELETE ON actions
FOR EACH ROW EXECUTE FUNCTION fn_enqueue_calendar_sync();

-- ==========================================
-- WORKSPACE LOCK HELPERS
-- Prevents concurrent workers double-processing
-- ==========================================

CREATE OR REPLACE FUNCTION fn_try_sync_lock(ws UUID)
RETURNS BOOLEAN AS $$
  SELECT pg_try_advisory_lock(hashtext(ws::text));
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_release_sync_lock(ws UUID)
RETURNS BOOLEAN AS $$
  SELECT pg_advisory_unlock(hashtext(ws::text));
$$ LANGUAGE sql;

REVOKE ALL ON FUNCTION fn_try_sync_lock(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_release_sync_lock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_try_sync_lock(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_release_sync_lock(UUID) TO service_role;

-- ==========================================
-- REALTIME: integrations table for live UI
-- ==========================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE calendar_integrations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==========================================
-- SCHEDULED WORKER (every minute)
-- Drains pending queues autonomously via
-- Edge Function google-sync (worker mode).
-- Requires: pg_net + pg_cron extensions and
-- app.worker_secret database setting.
-- ==========================================

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net unavailable: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron unavailable: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('sharks-google-sync-worker');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'sharks-google-sync-worker',
    '* * * * *',
    $job$ SELECT net.http_post(
         url := 'https://cyumczehpiiarwqrpgnu.supabase.co/functions/v1/google-sync',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-worker-secret', (SELECT value FROM app_secrets WHERE key = 'worker_secret')
         ),
         body := '{"mode":"worker"}'::jsonb,
         timeout_milliseconds := 60000
       ) $job$
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'cron schema unavailable - schedule manually after enabling pg_cron';
END $do$;
