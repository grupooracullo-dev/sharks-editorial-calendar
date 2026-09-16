-- ============================================
-- 060: Visitantes (anon) conseguem solicitar acesso
--
-- Problema: a policy de INSERT era TO authenticated — visitantes
-- não logados eram bloqueados pela RLS. E o dropdown de empresas
-- quebrava (anon sem SELECT em workspaces).
--
-- Correção:
--   1. Policy de INSERT para anon (restritiva: pedido pendente de
--      cliente, com nome e e-mail — evita lixo/abuso)
--   2. Função SECURITY DEFINER com as empresas ativas (id + nome)
--      para o formulário de visitantes — sem expor a tabela.
-- ============================================

DROP POLICY IF EXISTS access_requests_insert_public ON access_requests;
CREATE POLICY access_requests_insert_public ON access_requests
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND requested_role = 'client'
    AND email IS NOT NULL
    AND full_name IS NOT NULL
    AND auth_provider IS NULL
  );

-- Admin all: guarda de sessão evita que a avaliação da policy quebre
-- para anon (referência a user_environments sem grant gerava erro 42501)
DROP POLICY IF EXISTS access_requests_admin_all ON access_requests;
CREATE POLICY access_requests_admin_all ON access_requests
  FOR ALL TO public
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_guardian(auth.uid())
      OR EXISTS (
        SELECT 1 FROM user_environments ue
        WHERE ue.user_id = auth.uid() AND ue.role = 'admin'
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      is_guardian(auth.uid())
      OR EXISTS (
        SELECT 1 FROM user_environments ue
        WHERE ue.user_id = auth.uid() AND ue.role = 'admin'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.public_workspaces_list()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.name
  FROM workspaces w
  WHERE w.is_active
  ORDER BY w.name;
$$;

REVOKE EXECUTE ON FUNCTION public.public_workspaces_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_workspaces_list() TO anon, authenticated, service_role;
