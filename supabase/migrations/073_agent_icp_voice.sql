-- ============================================
-- 073: Agente — público-alvo (ICP), áudio e metadata de atividades
--
-- 1. prospecting_campaigns.icp_description: público-alvo livre enriquece
--    o matching do JEV (score contra o ICP da campanha).
-- 2. crm_lead_activities.metadata: anexos da atividade (audio_url dos
--    rascunhos de voz do agente, futuros: arquivos, links).
-- 3. Storage bucket agent-voice: áudios TTS do agente (leitura pública
--    para o player, escrita apenas service_role).
-- ============================================

-- ---------- 1. ICP da campanha ----------
ALTER TABLE public.prospecting_campaigns
  ADD COLUMN IF NOT EXISTS icp_description text;

-- ---------- 2. Metadata das atividades ----------
ALTER TABLE public.crm_lead_activities
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ---------- 3. Bucket de voz ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-voice', 'agent-voice', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agent_voice_read ON storage.objects;
CREATE POLICY agent_voice_read ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'agent-voice');
