-- ============================================
-- 066: Auditoria — remove tabela morta attachments
--
-- attachments: 0 linhas, nenhuma referência no código,
-- nenhuma FK de entrada e nenhum objeto no storage.
-- ============================================

DROP TABLE IF EXISTS public.attachments;
