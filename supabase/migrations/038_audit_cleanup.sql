-- ==========================================
-- 038: Limpeza da auditoria geral (2026-08-29)
--
-- 1) Membership residual em workspace inativo "RD"
--    (usuário 04junior.silva09@gmail.com não deve
--    permanecer vinculado a workspace desativado).
-- 2) app_secrets: tabela legada da migração 003 cujo
--    único segredo (worker_secret) não é mais consumido
--    por nenhuma função/trigger (verificado em pg_proc).
--    Removida para eliminar segredo morto.
-- ==========================================

-- 1) Membership residual
DELETE FROM memberships
WHERE workspace_id = '04db638c-fa17-49de-bfc4-8a45f8c9ac62'
  AND user_id = '2001bedf-8cfc-49c9-b577-92f1019fc4ba';

-- 2) Segredo legado sem consumidor
DROP TABLE IF EXISTS app_secrets;
