import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import ChatPanel from '@/components/chat/ChatPanel';
import { MessageType } from '@/types';
import { toast } from 'sonner';

export default function ClientChat() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { messages, send, loading } = useChat(currentWorkspace?.id);

  const handleSend = async (content: string, type: MessageType) => {
    if (!user) return;
    const ok = await send(content, type);
    if (!ok) toast.error('Não foi possível enviar a mensagem.');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Fale diretamente com a equipe Sharks
        </p>
      </div>

      <div className="h-[calc(100vh-260px)] min-h-[450px]">
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
