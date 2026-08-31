-- ============================================
-- 044_notification_enum.sql
-- Base para a lógica de notificações:
--   1. Novos tipos no enum (usados pelos triggers da 045)
--   2. Policy de DELETE própria (hoje o usuário não pode limpar)
--   3. Tabela notifications na publicação de realtime
-- ============================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'action_assigned';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'action_status_changed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'access_request';

-- Usuário pode remover as próprias notificações ("limpar tudo")
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Realtime: entrega as notificações do próprio usuário no sino
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
