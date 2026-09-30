-- ============================================
-- 069: CRM — canais sociais + abordagens do agente
--
-- 1. crm_leads.social_instagram: canal de abordagem (handle capturado
--    pelo agente a partir do site da empresa; DM manual no nível
--    Assistido — API da Meta não permite cold DM).
-- 2. crm_lead_activities: novos tipos de abordagem para o feed em
--    tempo real — outreach_draft (rascunho do agente), outreach_sent
--    (envio aprovado) e reply_received (resposta do prospect).
-- ============================================

-- ---------- 1. Canal Instagram ----------
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS social_instagram text;

-- ---------- 2. Tipos de atividade de abordagem ----------
ALTER TABLE public.crm_lead_activities
  DROP CONSTRAINT IF EXISTS crm_lead_activities_type_check;

ALTER TABLE public.crm_lead_activities
  ADD CONSTRAINT crm_lead_activities_type_check
  CHECK (type IN (
    'note','call','meeting','email','stage_change','system',
    'outreach_draft','outreach_sent','reply_received'
  ));

CREATE INDEX IF NOT EXISTS crm_lead_activities_type_idx
  ON public.crm_lead_activities (type, created_at);
