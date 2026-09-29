import PageHeader from '@/components/ui/PageHeader';
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
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      {/* Cabeçalho da página apenas no desktop — no mobile o painel já tem título */}
      <div className="hidden sm:block">
        <PageHeader title="Chat" />
        <p className="text-sm text-gray-500 mt-0.5">
          Fale diretamente com a equipe Sharks
        </p>
      </div>

      {/* Preenche o espaço disponível até o BottomNav / fim da viewport */}
      <div className="flex-1 min-h-[380px]">
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
