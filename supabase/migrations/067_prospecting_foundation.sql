-- ============================================
-- 067: Prospecção IA — fundação
--
-- 1. prospecting_campaigns: campanhas por ambiente (ICP, canais, automação).
-- 2. prospecting_campaign_products: produtos ofertados (N:N com
--    environment_products — sem catálogo paralelo).
-- 3. prospecting_jobs: fila de trabalho do Prospecting Engine
--    (decisão via Edge/JEV; I/O externo futuro via n8n com callbacks
--    validados por Edge Function — n8n NUNCA escreve direto no banco).
--    dedupe_key + UNIQUE impede chamadas externas/IA duplicadas.
--    Trigger valida a máquina de estados, independente de quem escreva.
-- 4. crm_leads: origem (origin), estado de prospecção separado do
--    estágio comercial (stage), vínculo com campanha e análise de IA
--    compacta (ai_fit/ai_priority/ai_next_step/ai_data JSONB).
-- 5. Contratos futuros (F2+): ProspectSourceProvider
--    (searchCompanies/getCompany/enrichCompany) e AIProvider
--    (JevProvider) vivem nas Edge Functions/_shared — este schema já
--    os comporta sem alterações.
-- ============================================

-- ---------- 1. prospecting_campaigns ----------
CREATE TABLE IF NOT EXISTS public.prospecting_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment_type NOT NULL,
  name text NOT NULL,
  objective text,
  segment text,
  location text,
  company_size text,
  target_count integer NOT NULL DEFAULT 100 CHECK (target_count > 0 AND target_count <= 100000),
  channels text[] NOT NULL DEFAULT '{}',
  automation_level text NOT NULL DEFAULT 'assisted'
    CHECK (automation_level IN ('assisted','semi_auto','auto')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','running','paused','completed','failed')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospecting_campaigns_env_status_idx
  ON public.prospecting_campaigns (environment, status);
CREATE INDEX IF NOT EXISTS prospecting_campaigns_assigned_idx
  ON public.prospecting_campaigns (assigned_to);

ALTER TABLE public.prospecting_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospecting_campaigns_select ON public.prospecting_campaigns
  FOR SELECT USING (is_env_staff((select auth.uid()), environment));
CREATE POLICY prospecting_campaigns_insert ON public.prospecting_campaigns
  FOR INSERT TO authenticated WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY prospecting_campaigns_update ON public.prospecting_campaigns
  FOR UPDATE USING (is_env_staff((select auth.uid()), environment))
  WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY prospecting_campaigns_delete ON public.prospecting_campaigns
  FOR DELETE USING (is_env_admin((select auth.uid()), environment));

-- ---------- 2. prospecting_campaign_products ----------
CREATE TABLE IF NOT EXISTS public.prospecting_campaign_products (
  campaign_id uuid NOT NULL REFERENCES public.prospecting_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.environment_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS prospecting_campaign_products_product_idx
  ON public.prospecting_campaign_products (product_id);

ALTER TABLE public.prospecting_campaign_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospecting_campaign_products_select ON public.prospecting_campaign_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );
CREATE POLICY prospecting_campaign_products_insert ON public.prospecting_campaign_products
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );
CREATE POLICY prospecting_campaign_products_delete ON public.prospecting_campaign_products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );

-- ---------- 3. prospecting_jobs ----------
CREATE TABLE IF NOT EXISTS public.prospecting_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.prospecting_campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'discover_companies','enrich_company','analyze_company','score_company',
    'generate_message','send_message','follow_up'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','retry')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  dedupe_key text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Impede chamadas externas/IA duplicadas para a mesma entidade na campanha
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospecting_jobs_dedupe
  ON public.prospecting_jobs (campaign_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Fila do worker (F2: prospecting-run com FOR UPDATE SKIP LOCKED)
CREATE INDEX IF NOT EXISTS prospecting_jobs_campaign_status_idx
  ON public.prospecting_jobs (campaign_id, status);
CREATE INDEX IF NOT EXISTS prospecting_jobs_type_status_idx
  ON public.prospecting_jobs (status, type);
CREATE INDEX IF NOT EXISTS prospecting_jobs_pending_scheduled_idx
  ON public.prospecting_jobs (scheduled_at)
  WHERE status IN ('pending','retry');

ALTER TABLE public.prospecting_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospecting_jobs_select ON public.prospecting_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );
CREATE POLICY prospecting_jobs_insert ON public.prospecting_jobs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );
CREATE POLICY prospecting_jobs_update ON public.prospecting_jobs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_staff((select auth.uid()), c.environment)
    )
  );
CREATE POLICY prospecting_jobs_delete ON public.prospecting_jobs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.prospecting_campaigns c
      WHERE c.id = campaign_id AND is_env_admin((select auth.uid()), c.environment)
    )
  );

-- Máquina de estados do job (vale para staff, worker e callbacks — ninguém burla)
CREATE OR REPLACE FUNCTION public.validate_prospecting_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  allowed boolean;
BEGIN
  -- Atualização sem troca de status (ex.: progresso/output) é permitida
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  allowed :=
       (OLD.status = 'pending'    AND NEW.status IN ('processing','failed'))
    OR (OLD.status = 'retry'      AND NEW.status IN ('processing','failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('completed','failed','retry'))
    OR (OLD.status = 'failed'     AND NEW.status = 'retry');

  IF NOT allowed THEN
    RAISE EXCEPTION 'Transicao de status invalida para prospecting_jobs: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prospecting_jobs_transition ON public.prospecting_jobs;
CREATE TRIGGER trg_prospecting_jobs_transition BEFORE UPDATE ON public.prospecting_jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospecting_job_transition();

-- ---------- 4. crm_leads: origem + prospecção + IA ----------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS prospecting_status text,
  ADD COLUMN IF NOT EXISTS prospecting_campaign_id uuid
    REFERENCES public.prospecting_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_fit numeric(4,3),
  ADD COLUMN IF NOT EXISTS ai_priority text CHECK (ai_priority IN ('alta','media','baixa')),
  ADD COLUMN IF NOT EXISTS ai_next_step text,
  ADD COLUMN IF NOT EXISTS ai_data jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_origin_check') THEN
    ALTER TABLE public.crm_leads
      ADD CONSTRAINT crm_leads_origin_check
      CHECK (origin IN ('manual','inbound','prospecting_agent','import'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_prospecting_status_check') THEN
    ALTER TABLE public.crm_leads
      ADD CONSTRAINT crm_leads_prospecting_status_check
      CHECK (prospecting_status IS NULL OR prospecting_status IN (
        'discovered','researching','qualified','discarded','queued',
        'contacted','replied','interested','converted_to_pipeline'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_leads_origin_idx ON public.crm_leads (origin);
CREATE INDEX IF NOT EXISTS crm_leads_prospecting_status_idx ON public.crm_leads (prospecting_status);
CREATE INDEX IF NOT EXISTS crm_leads_prospecting_campaign_idx ON public.crm_leads (prospecting_campaign_id);

-- ---------- 5. Triggers updated_at ----------
DROP TRIGGER IF EXISTS trg_prospecting_campaigns_updated ON public.prospecting_campaigns;
CREATE TRIGGER trg_prospecting_campaigns_updated BEFORE UPDATE ON public.prospecting_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_prospecting_jobs_updated ON public.prospecting_jobs;
CREATE TRIGGER trg_prospecting_jobs_updated BEFORE UPDATE ON public.prospecting_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 6. Realtime ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'prospecting_campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospecting_campaigns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'prospecting_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospecting_jobs;
  END IF;
END $$;
