-- ============================================
-- 042_chat_fix_and_status.sql
--
-- 1) CORRIGE BUG CRITICO de envio: chat_messages.sender_id era NOT NULL sem
--    default e o frontend nunca enviou sender_id -> TODO insert falhava
--    (0 mensagens no banco). Trigger BEFORE INSERT forca sender_id = auth.uid(),
--    o que corrige o envio e ainda impede spoofing de remetente.
--
-- 2) Adiciona coluna status ('sent'|'read') para indicadores de leitura (check/check duplo).
--
-- 3) Protege campos imutaveis da mensagem em UPDATE (somente status pode mudar).
-- ============================================

-- 1) Forca o remetente ser o usuario autenticado
CREATE OR REPLACE FUNCTION public.set_chat_message_sender()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sender_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_sender ON public.chat_messages;
CREATE TRIGGER trg_chat_message_sender
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_chat_message_sender();

-- 2) Coluna de status de leitura
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','read'));

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_status
  ON public.chat_messages(thread_id, status);

-- 3) Somente o destinatario (nunca o autor) pode marcar como lida
CREATE POLICY "messages_mark_read" ON public.chat_messages FOR UPDATE USING (
  sender_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_threads ct
    WHERE ct.id = thread_id
      AND public.has_workspace_access(auth.uid(), ct.workspace_id)
  )
) WITH CHECK (
  status = 'read'
  AND sender_id <> auth.uid()
);

-- 4) Garante que UPDATE so altere status (content/sender/type/thread imutaveis)
CREATE OR REPLACE FUNCTION public.protect_chat_message_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.content IS DISTINCT FROM NEW.content
     OR OLD.message_type IS DISTINCT FROM NEW.message_type
     OR OLD.thread_id IS DISTINCT FROM NEW.thread_id
     OR OLD.action_id IS DISTINCT FROM NEW.action_id THEN
    RAISE EXCEPTION 'chat message fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_protect ON public.chat_messages;
CREATE TRIGGER trg_chat_message_protect
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_chat_message_fields();
