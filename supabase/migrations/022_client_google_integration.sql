-- ==========================================
-- 022 — Integração Google Calendar do CLIENTE
--
-- Complementa a 021 (time = linha pessoal
-- global). Agora o CLIENTE também conecta a
-- própria conta Google — linha pessoal POR
-- WORKSPACE:
--
--   Time:    (workspace_id NULL, user_id U) -> TODOS os clientes
--   Cliente: (workspace_id W,    user_id U) -> só o workspace dele
--   Agência: (workspace_id W,    user_id NULL) -> inalterada
--
-- O worker (fan-out) já entrega para todas as
-- linhas workspace_id = W — nenhuma mudança
-- necessária no worker nem nos triggers.
-- ==========================================

-- 1) Unicidade: UNIQUE(workspace_id) antigo impedia
--    agência + cliente no mesmo workspace.
ALTER TABLE calendar_integrations
  DROP CONSTRAINT IF EXISTS calendar_integrations_workspace_id_key;

-- Uma linha de agência por workspace (user_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_ws_agency
  ON calendar_integrations (workspace_id)
  WHERE workspace_id IS NOT NULL AND user_id IS NULL;

-- Uma linha pessoal por (workspace, usuário)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_ws_user
  ON calendar_integrations (workspace_id, user_id)
  WHERE workspace_id IS NOT NULL AND user_id IS NOT NULL;

-- 2) RLS: cliente vê e gerencia APENAS a própria linha,
--    apenas de workspace que tem membership. Tokens de
--    agência e de outros clientes ficam invisíveis.
--    (Policies permissivas — combinam em OR com as da 021.)

DROP POLICY IF EXISTS integrations_client_select ON calendar_integrations;
CREATE POLICY integrations_client_select ON calendar_integrations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND has_workspace_access(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS integrations_client_update ON calendar_integrations;
CREATE POLICY integrations_client_update ON calendar_integrations
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND has_workspace_access(auth.uid(), workspace_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND has_workspace_access(auth.uid(), workspace_id)
  );
