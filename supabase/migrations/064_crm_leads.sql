-- ============================================
-- 064: CRM — jornada do lead (pipeline por ambiente)
--
-- 1. crm_leads: prospectos por ambiente com etapa fixa do funil
--    (new | contact | proposal | negotiation | won | lost).
--    Ao converter, workspace_id aponta para o cliente criado.
-- 2. crm_lead_activities: timeline de interações por lead
--    (note | call | meeting | email | stage_change | system).
-- 3. RLS por ambiente: leitura/escrita para staff do ambiente
--    (is_env_staff — equipe + guardião); delete só para admin
--    do ambiente (is_env_admin). Clientes nunca veem CRM.
-- 4. Realtime: tabelas na publicação supabase_realtime.
-- ============================================

-- ---------- 1. crm_leads ----------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment_type NOT NULL,
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  source text,
  segment text,
  value numeric(12,2),
  monthly_value numeric(12,2),
  expected_close_date date,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','contact','proposal','negotiation','won','lost')),
  lost_reason text,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_leads_env_stage_idx ON public.crm_leads (environment, stage);
CREATE INDEX IF NOT EXISTS crm_leads_owner_idx ON public.crm_leads (owner_id);
CREATE INDEX IF NOT EXISTS crm_leads_workspace_idx ON public.crm_leads (workspace_id);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_leads_select ON public.crm_leads
  FOR SELECT USING (is_env_staff((select auth.uid()), environment));
CREATE POLICY crm_leads_insert ON public.crm_leads
  FOR INSERT TO authenticated WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY crm_leads_update ON public.crm_leads
  FOR UPDATE USING (is_env_staff((select auth.uid()), environment))
  WITH CHECK (is_env_staff((select auth.uid()), environment));
CREATE POLICY crm_leads_delete ON public.crm_leads
  FOR DELETE USING (is_env_admin((select auth.uid()), environment));

-- ---------- 2. crm_lead_activities ----------
CREATE TABLE IF NOT EXISTS public.crm_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'note'
    CHECK (type IN ('note','call','meeting','email','stage_change','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_lead_activities_lead_idx
  ON public.crm_lead_activities (lead_id, created_at);

ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_lead_activities_select ON public.crm_lead_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_activities_insert ON public.crm_lead_activities
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_activities_delete ON public.crm_lead_activities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_admin((select auth.uid()), l.environment)
    )
  );

-- ---------- 3. Triggers de updated_at ----------
DROP TRIGGER IF EXISTS trg_crm_leads_updated ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------- 4. Realtime ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'crm_leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'crm_lead_activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_lead_activities;
  END IF;
END $$;
