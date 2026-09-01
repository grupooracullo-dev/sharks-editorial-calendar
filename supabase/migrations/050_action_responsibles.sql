-- ============================================
-- 050: Múltiplos responsáveis por ação
-- 1) Tabela action_responsibles (N:N) — preserva actions.responsible_id
--    como responsável PRINCIPAL (1º da lista) para compatibilidade
-- 2) Backfill das ações existentes
-- 3) RPC set_action_responsibles: gravação atômica
-- ============================================

-- ---------- 1. Tabela ----------
CREATE TABLE IF NOT EXISTS public.action_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, user_id)
);

CREATE INDEX IF NOT EXISTS action_responsibles_user_idx ON public.action_responsibles(user_id);

ALTER TABLE public.action_responsibles ENABLE ROW LEVEL SECURITY;

-- Leitura: quem vê a ação vê os responsáveis dela
CREATE POLICY action_resp_select ON public.action_responsibles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_visible(auth.uid(), a.workspace_id)
    )
  );

-- Escrita: quem pode escrever na ação (staff/admin do ambiente)
CREATE POLICY action_resp_insert ON public.action_responsibles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );

CREATE POLICY action_resp_delete ON public.action_responsibles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = action_id AND ws_env_allows_write(auth.uid(), a.workspace_id)
    )
  );

-- ---------- 2. Backfill ----------
INSERT INTO public.action_responsibles (action_id, user_id)
SELECT id, responsible_id
FROM public.actions
WHERE responsible_id IS NOT NULL
ON CONFLICT (action_id, user_id) DO NOTHING;

-- ---------- 3. RPC atômica ----------
CREATE OR REPLACE FUNCTION public.set_action_responsibles(
  p_action_id uuid,
  p_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = p_action_id
      AND ws_env_allows_write(caller, a.workspace_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para editar esta acao';
  END IF;

  DELETE FROM public.action_responsibles WHERE action_id = p_action_id;

  IF p_user_ids IS NOT NULL THEN
    INSERT INTO public.action_responsibles (action_id, user_id)
    SELECT p_action_id, uid
    FROM unnest(p_user_ids) AS uid
    ON CONFLICT (action_id, user_id) DO NOTHING;
  END IF;

  -- Compatibilidade: responsible_id = responsável principal (1º da lista)
  UPDATE public.actions
  SET responsible_id = p_user_ids[1]
  WHERE id = p_action_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_action_responsibles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_action_responsibles(uuid, uuid[]) TO authenticated, service_role;
