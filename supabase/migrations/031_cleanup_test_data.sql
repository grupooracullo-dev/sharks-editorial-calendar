-- 031_cleanup_test_data.sql
-- Remove workspaces de seed/teste, usuário demo e resíduos.
-- MANTÉM: PB Foods Distribuidora (sharks, ativo), RAÍZES DO ARAÇÁ (estrategos, ativo),
--         usuários reais (grupo.oracullo, 04silva.junior09, estrategosonline, equipe@sharks.com),
--         prospecto pbrnfoods@gmail.com (auth + request pendente — fluxo Google-first),
--         integração global do guardião (47fe93ba, workspace_id NULL by design).

DO $$
DECLARE
  v_demo_ws uuid[] := ARRAY[
    '00000000-0000-0000-0000-000000000100', -- PB & RN Foods (seed)
    '00000000-0000-0000-0000-000000000101', -- TechStart Solutions (seed)
    '00000000-0000-0000-0000-000000000102', -- Studio Fitness Pro (seed)
    '00000000-0000-0000-0000-000000000200', -- Cliente Demo Estrategos (seed)
    'e9a07dc4-5a20-4014-ac7c-db7113dcef07'  -- Raizes do Araça (duplicata na org Sharks)
  ];
  v_demo_user uuid;
BEGIN
  -- ============================================
  -- 1. Dependentes dos workspaces de teste
  -- ============================================
  DELETE FROM audit_logs WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM calendar_event_links WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM calendar_integrations WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM calendar_sync_queue WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE workspace_id = ANY(v_demo_ws));
  DELETE FROM chat_threads WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM strategic_dates WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM editorial_profiles WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM editorial_pillars WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM campaigns WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM channels WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM actions WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM estrategos_projects WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM estrategos_meetings WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM estrategos_implementations WHERE workspace_id = ANY(v_demo_ws);
  DELETE FROM memberships WHERE workspace_id = ANY(v_demo_ws);

  -- ============================================
  -- 2. Workspaces de teste
  -- ============================================
  DELETE FROM workspaces WHERE id = ANY(v_demo_ws);

  -- ============================================
  -- 3. Usuário demo cliente@pbrn.com (cadeia completa)
  --    (auth user é removido via GoTrue Admin API fora deste script)
  -- ============================================
  SELECT id INTO v_demo_user FROM users WHERE email = 'cliente@pbrn.com';
  IF v_demo_user IS NOT NULL THEN
    DELETE FROM user_environments WHERE user_id = v_demo_user;
    DELETE FROM memberships WHERE user_id = v_demo_user;
    DELETE FROM team_member_access WHERE user_id = v_demo_user;
    DELETE FROM calendar_integrations WHERE user_id = v_demo_user;
    DELETE FROM users WHERE id = v_demo_user;
  END IF;

  -- ============================================
  -- 4. Resíduos globais
  -- ============================================
  -- Fila: purgar todos os itens concluídos
  DELETE FROM calendar_sync_queue WHERE status = 'done';

  -- Integração desconectada no workspace ATIVO PB Foods (0 links, sem uso)
  DELETE FROM calendar_integrations WHERE is_connected = false;

  -- ============================================
  -- 5. Fechar request redundante do 04silva.junior09
  --    (já é admin_sharks com membership)
  -- ============================================
  UPDATE access_requests
  SET status = 'rejected',
      rejected_reason = 'Redundante — usuário já possui acesso de administrador.',
      processed_at = now()
  WHERE email = '04silva.junior09@gmail.com' AND status = 'pending';
END $$;
