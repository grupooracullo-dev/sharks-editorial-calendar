-- ============================================
-- 054: Nome do remetente visível ao cliente
--
-- A RLS users_select impede o CLIENTE de ler perfis da equipe,
-- então o embed sender chega null no portal do cliente. Gravamos
-- o full_name do remetente na própria mensagem (histórico preciso,
-- zero exposição de e-mail, zero mudança de RLS).
-- ============================================

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_name text;

CREATE OR REPLACE FUNCTION public.set_chat_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.sender_id := auth.uid();
  NEW.sender_name := (SELECT full_name FROM public.users WHERE id = NEW.sender_id);
  RETURN NEW;
END;
$function$;

-- Backfill das mensagens existentes
UPDATE chat_messages
SET sender_name = (SELECT full_name FROM users WHERE users.id = chat_messages.sender_id)
WHERE sender_name IS NULL AND sender_id IS NOT NULL;
