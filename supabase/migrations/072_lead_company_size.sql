-- ============================================
-- 072: CRM — colunas do ICP do agente em crm_leads
-- company_size (porte) · location (cidade/UF) · website_url (site)
-- Usadas pela análise (JEV) e enriquecimento; nunca foram criadas.
-- ============================================

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS website_url text;

