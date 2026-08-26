-- ==========================================
-- 018 — Fix INSERT de access_requests (senha)
-- A coluna auth_provider tinha DEFAULT
-- 'email'::text no banco, mas o CHECK
-- chk_access_requests_auth_provider (012)
-- so aceita NULL ou 'google'. Resultado:
-- qualquer INSERT que omite auth_provider
-- (formulario classico de senha, RequestAccess)
-- violava o CHECK com 23514 e falhava.
--
-- Fix: remover o default — omitir a coluna
-- passa a gravar NULL (valido pelo CHECK),
-- e 'google' continua sendo enviado
-- explicitamente pelo fluxo Google-first.
-- ==========================================

ALTER TABLE access_requests
  ALTER COLUMN auth_provider DROP DEFAULT;
