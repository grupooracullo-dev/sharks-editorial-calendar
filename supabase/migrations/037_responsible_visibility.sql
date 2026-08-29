-- ==========================================
-- 037: Visibilidade de responsáveis (seletor de ações)
--
-- Problema: usuário com papel "team" via apenas a si mesmo
-- no seletor de Responsável do cadastro de ações, e o campo
-- responsável embutido nas ações vinha vazio.
--
-- Causa (RLS):
--   users_select          → só self OU is_sharks_admin (pré-multi-env)
--   user_env_select       → só self OU guardião OU ADMIN do ambiente
--
-- Correção: staff (admin/team) de qualquer ambiente lê perfis de
-- usuários; staff do ambiente lê a matriz user_environments daquele
-- ambiente. Clientes continuam vendo apenas os próprios dados.
-- ==========================================

-- Helper: usuário é staff (admin/team) de QUALQUER ambiente ou guardião
CREATE OR REPLACE FUNCTION is_any_env_staff(user_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_guardian(user_uuid)
     OR EXISTS (
       SELECT 1 FROM user_environments
       WHERE user_environments.user_id = user_uuid
         AND user_environments.role IN ('admin', 'team')
     );
$$;

-- users: próprio perfil OU guardião OU staff de qualquer ambiente
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT USING (
  auth.uid() = id
  OR is_guardian(auth.uid())
  OR is_any_env_staff(auth.uid())
);

-- user_environments: próprias linhas OU guardião OU staff do ambiente
DROP POLICY IF EXISTS user_env_select ON user_environments;
CREATE POLICY user_env_select ON user_environments FOR SELECT USING (
  user_id = auth.uid()
  OR is_guardian(auth.uid())
  OR is_env_staff(auth.uid(), environment)
);
