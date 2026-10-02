-- ============================================
-- 074: Conexão do Instagram do ambiente (prospecção in-app)
--
-- 1 conta profissional conectada por ambiente. O access_token da Página
-- (via Facebook Login for Business) fica NO APP, com camada dupla:
--   - RLS: só admin do ambiente gerencia; staff lê metadados (sem token)
--   - column grants: access_token inacessível via REST para authenticated
-- A ingest (prospecting-ingest) e o DM (instagram-send-dm) leem o token
-- pelo service role (que contorna RLS).
-- ============================================

CREATE TABLE IF NOT EXISTS public.instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment_type NOT NULL,
  ig_user_id text NOT NULL,
  username text,
  page_id text,
  page_name text,
  access_token text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  connected_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1 conexão ativa por ambiente
CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_conn_env
  ON public.instagram_connections (environment)
  WHERE status = 'connected';
CREATE INDEX IF NOT EXISTS instagram_conn_env_idx
  ON public.instagram_connections (environment);

ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instagram_conn_select ON public.instagram_connections;
CREATE POLICY instagram_conn_select ON public.instagram_connections
  FOR SELECT TO authenticated
  USING (is_env_staff((select auth.uid()), environment));

DROP POLICY IF EXISTS instagram_conn_write ON public.instagram_connections;
CREATE POLICY instagram_conn_write ON public.instagram_connections
  FOR INSERT TO authenticated
  WITH CHECK (is_env_admin((select auth.uid()), environment));

DROP POLICY IF EXISTS instagram_conn_update ON public.instagram_connections;
CREATE POLICY instagram_conn_update ON public.instagram_connections
  FOR UPDATE TO authenticated
  USING (is_env_admin((select auth.uid()), environment))
  WITH CHECK (is_env_admin((select auth.uid()), environment));

DROP POLICY IF EXISTS instagram_conn_delete ON public.instagram_connections;
CREATE POLICY instagram_conn_delete ON public.instagram_connections
  FOR DELETE TO authenticated
  USING (is_env_admin((select auth.uid()), environment));

-- O token NUNCA sai pelo REST para usuários autenticados:
-- strip de colunas (o app consulta colunas explícitas, sem access_token)
REVOKE ALL ON public.instagram_connections FROM authenticated;
GRANT SELECT (id, environment, ig_user_id, username, page_id, page_name, status, connected_by, created_at, updated_at)
  ON public.instagram_connections TO authenticated;
