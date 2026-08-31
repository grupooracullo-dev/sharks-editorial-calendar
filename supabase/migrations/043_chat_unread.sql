-- ============================================
-- 043_chat_unread.sql
-- Tracking de leitura por usuario/thread para contagem de nao lidas + RPC.
-- ============================================

CREATE TABLE IF NOT EXISTS public.chat_thread_reads (
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_reads_user
  ON public.chat_thread_reads(user_id);

ALTER TABLE public.chat_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_reads_select_own" ON public.chat_thread_reads
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "thread_reads_insert_own" ON public.chat_thread_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "thread_reads_update_own" ON public.chat_thread_reads
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RPC: contagem de nao lidas por workspace.
-- SECURITY INVOKER para que o RLS das tabelas subjacentes seja aplicado ao chamador.
CREATE OR REPLACE FUNCTION public.get_chat_unread_counts()
RETURNS TABLE(workspace_id uuid, unread_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.workspace_id, count(m.id)::bigint AS unread_count
  FROM public.chat_threads t
  JOIN public.chat_messages m ON m.thread_id = t.id
  LEFT JOIN public.chat_thread_reads r
    ON r.thread_id = t.id AND r.user_id = auth.uid()
  WHERE m.sender_id <> auth.uid()
    AND m.created_at > coalesce(r.last_read_at, to_timestamp(0))
  GROUP BY t.workspace_id;
$$;
