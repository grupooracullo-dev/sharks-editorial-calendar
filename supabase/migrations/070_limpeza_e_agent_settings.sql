-- ============================================
-- 070: Limpeza de peso morto + configuração do agente
--
-- 1. DROP de tabelas sem uso (backup prévio em
--    BACKUP-oracullo-tabelas.json no Desktop do admin):
--    channels (0 refs, 0 linhas) · calendar_templates (Modelos removido)
--    partners/action_partners (feature Parceiros removida)
-- 2. prospecting_agent_settings: personalidade e parâmetros do agente
--    por ambiente (JSONB — evita dezenas de colunas), com seeds.
-- Nenhuma tabela de conteúdo é afetada: actions/crm_leads/chat intactos.
-- ============================================

-- ---------- 1. Drops seguros ----------
DROP TABLE IF EXISTS public.action_partners;
DROP TABLE IF EXISTS public.partners;
DROP TABLE IF EXISTS public.calendar_templates;
DROP TABLE IF EXISTS public.channels;

-- ---------- 2. prospecting_agent_settings ----------
CREATE TABLE IF NOT EXISTS public.prospecting_agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment_type NOT NULL UNIQUE,
  personality jsonb NOT NULL DEFAULT '{}'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospecting_agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospecting_agent_settings_select ON public.prospecting_agent_settings
  FOR SELECT USING (is_env_staff((select auth.uid()), environment));
CREATE POLICY prospecting_agent_settings_insert ON public.prospecting_agent_settings
  FOR INSERT TO authenticated WITH CHECK (is_env_admin((select auth.uid()), environment));
CREATE POLICY prospecting_agent_settings_update ON public.prospecting_agent_settings
  FOR UPDATE USING (is_env_admin((select auth.uid()), environment))
  WITH CHECK (is_env_admin((select auth.uid()), environment));

-- Seeds: personalidade e parâmetros padrão por ambiente
INSERT INTO public.prospecting_agent_settings (environment, personality, params)
VALUES
  ('sharks_company',
    '{"agent_name":"Sofia","tone":"amigavel","language":"pt-BR","persona":"Consultora comercial da agência Sharks Company: prática, objetiva, sem enrolação, sempre mostrando valor com exemplos do nicho do lead.","brand_voice_rules":"Nunca prometer resultados garantidos; usar o nome do lead; frases curtas; máximo 1 pergunta por mensagem; jamais mencionar concorrentes.","signature":"— Equipe Sharks Company","greeting_style":"curto, com pergunta aberta"}'::jsonb,
    '{"fit_draft_threshold":0.75,"fit_discard_threshold":0.5,"confidence_auto":0.7,"confidence_review":0.4,"max_companies_per_run":20,"max_messages_per_day":50,"glm_temperature":0.7,"follow_up_days":3}'::jsonb),
  ('estrategos',
    '{"agent_name":"Estratego","tone":"formal","language":"pt-BR","persona":"Consultor estratégico da Estrategos: técnico, analítico, focado em diagnóstico e dados, escreve com precisão e simplicidade.","brand_voice_rules":"Basear cada afirmação em dado do diagnóstico; não usar jargão sem explicar; sempre propor próximo passo claro.","signature":"— Estrategos","greeting_style":"formal e direto"}'::jsonb,
    '{"fit_draft_threshold":0.75,"fit_discard_threshold":0.5,"confidence_auto":0.7,"confidence_review":0.4,"max_companies_per_run":20,"max_messages_per_day":50,"glm_temperature":0.7,"follow_up_days":3}'::jsonb)
ON CONFLICT (environment) DO NOTHING;

-- ---------- 3. Trigger updated_at ----------
DROP TRIGGER IF EXISTS trg_prospecting_agent_settings_updated ON public.prospecting_agent_settings;
CREATE TRIGGER trg_prospecting_agent_settings_updated BEFORE UPDATE ON public.prospecting_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
