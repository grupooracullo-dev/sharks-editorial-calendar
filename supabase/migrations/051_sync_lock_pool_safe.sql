-- ============================================
-- 051: Sync lock à prova de connection pooler
--
-- Problema: fn_try_sync_lock usava pg_try_advisory_lock
-- (lock de SESSÃO). Com o connection pool do PostgREST,
-- a sessão que adquiriu o lock fica idle segurando-o e o
-- fn_release_sync_lock roda em OUTRA conexão do pool —
-- o unlock falha silenciosamente e o worker pula o
-- workspace para sempre (fila de sync trava).
--
-- Solução: lock em tabela com TTL de 5 minutos.
-- ============================================

CREATE TABLE IF NOT EXISTS public.sync_locks (
  ws uuid PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;

-- IMPORTANTE: mantém o nome do parâmetro `ws` (a edge function chama
-- rpc com { ws: ... } — renomear quebra a resolução do PostgREST).
DROP FUNCTION IF EXISTS public.fn_try_sync_lock(uuid);
DROP FUNCTION IF EXISTS public.fn_release_sync_lock(uuid);

CREATE OR REPLACE FUNCTION public.fn_try_sync_lock(ws uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  acquired boolean;
BEGIN
  -- Expira locks órfãos (função morta antes do release)
  DELETE FROM public.sync_locks sl WHERE sl.acquired_at < now() - interval '5 minutes';

  -- "ws" entre aspas = coluna; ws sem aspas = parâmetro plpgsql
  INSERT INTO public.sync_locks ("ws") VALUES (ws)
  ON CONFLICT ("ws") DO NOTHING;

  acquired := FOUND;
  RETURN acquired;
END $$;

CREATE OR REPLACE FUNCTION public.fn_release_sync_lock(ws uuid)
RETURNS boolean
LANGUAGE sql
SET search_path = public
AS $$
  DELETE FROM public.sync_locks sl WHERE sl.ws = ws
  RETURNING true;
$$;

-- Assinaturas idênticas às anteriores → zero mudança no worker.
