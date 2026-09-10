-- ============================================
-- 058: Dedupe de notificações + limpeza do acúmulo
--
-- 1. dedupe_key + índice único (user_id, dedupe_key):
--    NULLs não conflitam (notificações normais livres);
--    inserts com dedupe_key repetido são ignorados (upsert).
-- 2. Limpeza: atrasadas (1 por ação), solicitações duplicadas,
--    erros de sync antigos, não-lidas antigas viram lidas.
-- ============================================

-- ---------- 1. Limpeza ----------
-- Atrasadas: manter a mais recente por (usuário + mensagem da ação)
DELETE FROM notifications n
USING notifications n2
WHERE n.title = 'Ação atrasada'
  AND n2.title = 'Ação atrasada'
  AND n.user_id = n2.user_id
  AND n.message = n2.message
  AND (n.created_at < n2.created_at OR (n.created_at = n2.created_at AND n.ctid > n2.ctid));

-- Solicitação de acesso: manter 1 cópia por usuário
DELETE FROM notifications n
USING notifications n2
WHERE n.title = 'Nova solicitação de acesso'
  AND n2.title = 'Nova solicitação de acesso'
  AND n.user_id = n2.user_id
  AND n.message = n2.message
  AND (n.created_at > n2.created_at OR (n.created_at = n2.created_at AND n.ctid > n2.ctid));

-- Erros de sync com mais de 7 dias
DELETE FROM notifications WHERE type = 'sync_error' AND created_at < now() - interval '7 days';

-- Não-lidas antigas viram lidas
UPDATE notifications SET is_read = true
WHERE is_read = false AND created_at < now() - interval '7 days';

-- ---------- 2. Estrutura de dedupe ----------
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
  ON notifications (user_id, dedupe_key);
