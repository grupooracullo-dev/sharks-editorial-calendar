-- 028_multi_env_access_requests.sql
-- Converte requested_environment (enum single) para requested_environments (jsonb array)

-- =============================================
-- 1. Nova coluna jsonb
-- =============================================
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS requested_environments jsonb NOT NULL DEFAULT '["sharks_company"]';

-- =============================================
-- 2. Migrar dados existentes
-- =============================================
UPDATE access_requests
SET requested_environments = to_jsonb(ARRAY[requested_environment::text])
WHERE requested_environments IS NULL
   OR requested_environments = '["sharks_company"]'
   OR jsonb_array_length(requested_environments) = 0;

-- =============================================
-- 3. Comentário
-- =============================================
COMMENT ON COLUMN access_requests.requested_environments IS 'Array de ambientes solicitados (sharks_company, estrategos)';

-- =============================================
-- 4. Garantir que pelo menos um ambiente existe (check constraint)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_envs_check'
  ) THEN
    ALTER TABLE access_requests ADD CONSTRAINT access_requests_envs_check
      CHECK (jsonb_array_length(requested_environments) > 0);
  END IF;
END $$;
