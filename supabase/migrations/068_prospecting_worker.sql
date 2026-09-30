-- ============================================
-- 068: Prospecção IA — worker (F2)
--
-- 1. claim_prospecting_jobs: claim atômico com FOR UPDATE SKIP LOCKED
--    (padrão de fila Postgres; worker chamado via pg_cron → pg_net →
--    Edge Function prospecting-run com x-worker-secret).
-- 2. Índices de dedupe de contato em crm_leads (ingest inbound).
-- 3. Config privada para os crons (private.prospecting_config) e agendamentos:
--    prospecting-run a cada 5 min + REPARO do google-sync worker (quebrado
--    desde a 038, que removeu app_secrets). Reutiliza o mesmo
--    worker_secret (env WORKER_SECRET das Edge Functions).
-- ============================================

-- ---------- 1. Claim atômico de jobs ----------
CREATE OR REPLACE FUNCTION public.claim_prospecting_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.prospecting_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH next_jobs AS (
    SELECT id
    FROM public.prospecting_jobs
    WHERE status IN ('pending','retry') AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.prospecting_jobs j
  SET status = 'processing',
      attempts = j.attempts + 1,
      started_at = CASE WHEN j.started_at IS NULL THEN now() ELSE j.started_at END
  FROM next_jobs
  WHERE j.id = next_jobs.id
  RETURNING j.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_prospecting_jobs(integer) FROM PUBLIC, anon, authenticated;

-- ---------- 2. Índices de dedupe de contato (ingest) ----------
CREATE INDEX IF NOT EXISTS crm_leads_contact_email_dedupe_idx
  ON public.crm_leads (environment, lower(btrim(contact_email)))
  WHERE contact_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_leads_contact_phone_dedupe_idx
  ON public.crm_leads (environment, contact_phone)
  WHERE contact_phone IS NOT NULL;

-- ---------- 3. Config privada para os crons ----------
-- app_secrets (003) foi removida na 038 — os crons que referenciavam a
-- tabela quebravam em runtime. Nova fonte: private.prospecting_config,
-- com acesso revogado para anon/authenticated.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.prospecting_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.prospecting_config FROM PUBLIC, anon, authenticated;

-- ---------- 4. Cron do worker (a cada 5 min) ----------
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net unavailable: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('oracullo-prospecting-worker');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'oracullo-prospecting-worker',
    '*/5 * * * *',
    $job$ SELECT net.http_post(
         url := 'https://cyumczehpiiarwqrpgnu.supabase.co/functions/v1/prospecting-run',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-worker-secret', (SELECT value FROM private.prospecting_config WHERE key = 'worker_secret')
         ),
         body := '{"mode":"worker"}'::jsonb,
         timeout_milliseconds := 60000
       ) $job$
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'cron schema unavailable - schedule manually after enabling pg_cron';
END $do$;

-- ---------- 5. Reparo: cron do google-sync quebrava desde a 038 ----------
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
           'x-worker-secret', (SELECT value FROM private.prospecting_config WHERE key = 'worker_secret')
         ),
         body := '{"mode":"worker"}'::jsonb,
         timeout_milliseconds := 60000
       ) $job$
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'cron schema unavailable - schedule manually after enabling pg_cron';
END $do$;
