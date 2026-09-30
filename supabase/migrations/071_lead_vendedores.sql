-- ============================================
-- 071: CRM — vendedores vinculados ao lead (N:N, opcional)
--
-- Um lead pode ter vários membros do time vinculados como vendedores
-- (ex.: SDR que prospectou + closer que fecha). owner_id continua o
-- responsável principal. Vínculo é SEMPRE opcional.
-- ============================================

CREATE TABLE IF NOT EXISTS public.crm_lead_team (
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS crm_lead_team_user_idx ON public.crm_lead_team (user_id);

ALTER TABLE public.crm_lead_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_lead_team_select ON public.crm_lead_team
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_team_insert ON public.crm_lead_team
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
CREATE POLICY crm_lead_team_delete ON public.crm_lead_team
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id AND is_env_staff((select auth.uid()), l.environment)
    )
  );
