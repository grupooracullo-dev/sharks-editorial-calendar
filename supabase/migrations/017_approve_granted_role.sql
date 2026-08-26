-- ==========================================
-- 017 — Aprovação com concessão de papel
-- O admin agora decide na aprovação se o
-- solicitante vira 'client' ou 'sharks_team'
-- (com permissões e clientes atribuídos).
--
-- granted_role registra o papel EFETIVAMENTE
-- concedido (auditável), distinto do
-- requested_role enviado pelo solicitante.
-- ==========================================

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS granted_role TEXT
  CHECK (granted_role IS NULL OR granted_role IN ('client', 'sharks_team'));
