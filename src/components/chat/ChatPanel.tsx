import { useState, useRef, useEffect } from 'react';
import { User, MessageType } from '@/types';
import ChatMessage from './ChatMessage';
import Button from '@/components/ui/Button';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageData {
  id: string;
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
}

interface ChatPanelProps {
  messages: ChatMessageData[];
  currentUser: User;
  onSendMessage: (content: string, type: MessageType) => void;
  title?: string;
  subtitle?: React.ReactNode;
  loading?: boolean;
}

export default function ChatPanel({ messages, currentUser, onSendMessage, title, subtitle, loading }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('message');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim(), messageType);
    setInputValue('');
    setMessageType('message');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      {(title || subtitle) && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-gray-900">Nenhuma mensagem ainda</p>
            <p className="text-xs text-gray-500 mt-1">Envie a primeira mensagem para começar a conversa.</p>
          </div>
        ) : (
          messages.map(msg => (
            <ChatMessage
              key={msg.id}
              id={msg.id}
              content={msg.content}
              sender={msg.sender}
              message_type={msg.message_type}
              created_at={msg.created_at}
              isOwn={msg.sender.id === currentUser.id}
            />
          ))
        )}
      </div>

      {/* Type selector */}
      <div className="px-4 pt-2 flex gap-2">
        {(['message', 'doubt', 'suggestion'] as MessageType[]).map(type => {
          const labels = { message: 'Mensagem', doubt: 'Dúvida', suggestion: 'Sugestão' };
          return (
            <button
              key={type}
              onClick={() => setMessageType(type)}
              className={cn(
                'px-3 py-1 text-xs rounded-full transition-colors',
                messageType === type
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              {labels[type]}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-4">
        <div className="flex gap-2 items-end">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
          <Button onClick={handleSend} disabled={!inputValue.trim()} size="icon" className="h-[42px] w-[42px] p-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
