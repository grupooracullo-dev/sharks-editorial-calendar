import { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import ChatPanel from '@/components/chat/ChatPanel';
import Avatar from '@/components/ui/Avatar';
import Card from '@/components/ui/Card';
import { MessageType } from '@/types';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

export default function EstrategosChat() {
  const { user } = useAuth();
  const { workspacesByEnv, currentWorkspace } = useWorkspace();
  const { isMobile } = useBreakpoint();
  const wsList = workspacesByEnv('estrategos');
  const [selectedWsId, setSelectedWsId] = useState<string>(currentWorkspace?.environment === 'estrategos' ? currentWorkspace.id : wsList[0]?.id || '');
  const [showWsList, setShowWsList] = useState(false);

  const activeWsId = selectedWsId || wsList[0]?.id;
  const { messages, send, loading } = useChat(activeWsId);
  const selectedWs = wsList.find(w => w.id === activeWsId);

  const handleSend = async (content: string, type: MessageType) => {
    if (!activeWsId || !user) return;
    const ok = await send(content, type);
    if (!ok) toast.error('Não foi possível enviar a mensagem.');
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">Converse com os clientes em tempo real</p>
      </div>

      {isMobile && (
        <div className="relative">
          <button
            onClick={() => setShowWsList(!showWsList)}
            className="w-full flex items-center justify-between gap-2 p-3 bg-white border border-gray-200 rounded-lg text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedWs ? (
                <>
                  <Avatar name={selectedWs.name} size="sm" />
                  <span className="text-sm font-medium text-gray-900 truncate">{selectedWs.name}</span>
                </>
              ) : (
                <span className="text-sm text-gray-500">Selecione um cliente</span>
              )}
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </button>
          {showWsList && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
              {wsList.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => { setSelectedWsId(ws.id); setShowWsList(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                >
                  <Avatar name={ws.name} size="sm" />
                  <span className="truncate">{ws.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {!isMobile && (
          <Card padding="none">
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Clientes</p>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {wsList.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => setSelectedWsId(ws.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    ws.id === activeWsId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Avatar name={ws.name} size="sm" />
                  <span className="truncate">{ws.name}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card padding="none">
          {activeWsId && user ? (
            <ChatPanel
              messages={messages}
              currentUser={user}
              onSendMessage={handleSend}
              loading={loading}
              title={selectedWs?.name}
            />
          ) : (
            <p className="text-sm text-gray-500 py-12 text-center">Selecione um cliente para conversar</p>
          )}
        </Card>
      </div>
    </div>
  );
}
