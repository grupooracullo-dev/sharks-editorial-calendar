-- ==========================================
-- 021 — Integração Google Calendar POR USUÁRIO
--
-- Problema: calendar_integrations não tinha
-- user_id. A linha "global" (workspace_id NULL)
-- era ÚNICA e compartilhada: o admin conectava
-- a conta Google dele e TODO o time enxergava/
-- usava essa integração — todas as ações de
-- todos os usuários iam para o calendário do
-- admin. Se outro membro conectasse, ele
-- SOBRESCREVIA os tokens do admin.
--
-- Fix: modelo pessoal por usuário.
--   Linha pessoal: workspace_id NULL + user_id X
--     → "Minha agenda Google" de cada usuário
--   Linha de cliente: workspace_id W + user_id NULL
--     → inalterada (agenda do cliente)
-- O worker faz fan-out: cada ação vai para TODAS
-- as integrações ativas que cobrem o workspace.
-- ==========================================

-- 1) Colunas
ALTER TABLE calendar_integrations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE calendar_event_links
  ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES calendar_integrations(id) ON DELETE CASCADE;

ALTER TABLE calendar_sync_queue
  ADD COLUMN IF NOT EXISTS integration_id UUID;

-- 2) Unicidade
-- Uma linha pessoal global por usuário (linhas por cliente continuam
-- cobertas pelo UNIQUE(workspace_id) existente).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_user_global
  ON calendar_integrations (user_id)
  WHERE workspace_id IS NULL AND user_id IS NOT NULL;

-- Links: um por (ação, integração). NULLs nunca conflitam (linhas
-- legadas). Substitui UNIQUE(action_id, workspace_id), que impedia
-- dois links (um por integração pessoal) para a mesma ação+workspace.
ALTER TABLE calendar_event_links
  DROP CONSTRAINT IF EXISTS calendar_event_links_action_id_ws_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cel_action_integration
  ON calendar_event_links (action_id, integration_id);
-- Preserva dedup legado para linhas sem integração
CREATE UNIQUE INDEX IF NOT EXISTS uq_cel_action_ws_legacy
  ON calendar_event_links (action_id, workspace_id)
  WHERE integration_id IS NULL;

-- 3) Backfill de propriedade
-- 3a. Linha global conectada → dono = usuário cujo email bate
UPDATE calendar_integrations ci
   SET user_id = u.id
  FROM users u
 WHERE ci.workspace_id IS NULL
   AND ci.user_id IS NULL
   AND ci.google_account_email IS NOT NULL
   AND lower(ci.google_account_email) = lower(u.email);

-- 3b. Sobras globais conectadas sem match de email → admin_sharks
UPDATE calendar_integrations ci
   SET user_id = (
     SELECT u.id FROM users u
     WHERE u.role = 'admin_sharks'
     ORDER BY u.created_at
     LIMIT 1
   )
 WHERE ci.workspace_id IS NULL
   AND ci.user_id IS NULL
   AND ci.is_connected = TRUE;

-- 3c. Links legados → integração dona
--     1) link de workspace W → integração por-workspace de W
UPDATE calendar_event_links l
   SET integration_id = ci.id
  FROM calendar_integrations ci
 WHERE l.integration_id IS NULL
   AND ci.workspace_id = l.workspace_id;

--     2) links sem integração por-workspace → linha pessoal global
--        (hoje existe apenas uma; min() desempata deterministicamente)
UPDATE calendar_event_links l
   SET integration_id = ci.id
  FROM calendar_integrations ci
 WHERE l.integration_id IS NULL
   AND ci.workspace_id IS NULL
   AND ci.user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM calendar_integrations c2
     WHERE c2.workspace_id = l.workspace_id
   )
   AND ci.user_id = (
     SELECT MIN(c3.user_id::text)::uuid FROM calendar_integrations c3
     WHERE c3.workspace_id IS NULL AND c3.user_id IS NOT NULL
   );

-- 4) Trigger de delete embutido: carrega integration_id para o worker
--    saber EM QUAL agenda apagar o evento.
CREATE OR REPLACE FUNCTION fn_enqueue_calendar_sync_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM calendar_integrations ci
    WHERE (ci.workspace_id = OLD.workspace_id OR ci.workspace_id IS NULL)
      AND ci.is_connected = TRUE
      AND ci.auto_sync = TRUE
  ) THEN
    INSERT INTO calendar_sync_queue (workspace_id, action_id, operation, google_event_id, integration_id)
    SELECT OLD.workspace_id, NULL, 'delete', l.google_event_id, l.integration_id
    FROM calendar_event_links l
    WHERE l.action_id = OLD.id
      AND l.google_event_id IS NOT NULL;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5) RLS: linhas pessoais são do dono (admin vê tudo)
DROP POLICY IF EXISTS integrations_select ON calendar_integrations;
CREATE POLICY integrations_select ON calendar_integrations
  FOR SELECT TO authenticated
  USING (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()))
    AND (
      is_sharks_admin(auth.uid())
      OR user_id IS NULL
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS integrations_team_all ON calendar_integrations;
CREATE POLICY integrations_team_all ON calendar_integrations
  FOR ALL TO authenticated
  USING (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()))
    AND (
      is_sharks_admin(auth.uid())
      OR user_id IS NULL
      OR user_id = auth.uid()
    )
  )
  WITH CHECK (
    (is_sharks_admin(auth.uid()) OR is_sharks_team(auth.uid()))
    AND (
      is_sharks_admin(auth.uid())
      OR user_id IS NULL
      OR user_id = auth.uid()
    )
  );
