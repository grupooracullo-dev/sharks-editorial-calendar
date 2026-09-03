import { useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { useChatUnread } from '@/hooks/useChatUnread';
import ChatPanel from '@/components/chat/ChatPanel';
import { MessageType } from '@/types';
import { toast } from 'sonner';

export default function ClientChat() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { messages, send, loading, threadId } = useChat(currentWorkspace?.id, user);
  const { markRead } = useChatUnread(user?.id);

  useEffect(() => {
    if (!threadId || !currentWorkspace?.id || loading) return;
    const hasUnreadIncoming = messages.some(m => m.sender?.id !== user?.id && m.status !== 'read');
    if (hasUnreadIncoming) markRead(threadId, currentWorkspace.id);
  }, [threadId, currentWorkspace?.id, messages, loading, markRead, user?.id]);

  const handleSend = async (content: string, type: MessageType) => {
    if (!user) return;
    const ok = await send(content, type);
    if (!ok) toast.error('Não foi possível enviar a mensagem.');
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho da página apenas no desktop — no mobile o painel já tem título */}
      <div className="hidden sm:block">
        <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Fale diretamente com a equipe Sharks
        </p>
      </div>

      {/* Mobile: ocupa até o BottomNav (topo ~60 + padding 16 + nav 56 + safe area) */}
      <div className="h-[calc(100dvh-8.25rem-env(safe-area-inset-bottom))] min-h-[380px] sm:h-[calc(100dvh-316px)]">
        <ChatPanel
          messages={messages}
          currentUser={user!}
          onSendMessage={handleSend}
          loading={loading}
          title={`Sharks Company — ${currentWorkspace?.name || ''}`}
          subtitle="Resposta rápida em horário comercial · Tempo real"
        />
      </div>
    </div>
  );
}
