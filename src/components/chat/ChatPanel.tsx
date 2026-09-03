import { useState, useRef, useEffect, useMemo, ReactNode } from 'react';
import { User, MessageType, MessageStatus } from '@/types';
import ChatMessage from './ChatMessage';
import ChatDateSeparator from './ChatDateSeparator';
import ChatSkeleton from './ChatSkeleton';
import EmojiPicker from '@/components/ui/EmojiPicker';
import Button from '@/components/ui/Button';
import { Send, Smile, MessageSquare, Lightbulb, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<MessageType, { label: string; icon: typeof MessageSquare; color: string }> = {
  message: { label: 'Mensagem', icon: MessageSquare, color: 'text-gray-500' },
  doubt: { label: 'Dúvida', icon: HelpCircle, color: 'text-amber-600' },
  suggestion: { label: 'Sugestão', icon: Lightbulb, color: 'text-blue-600' },
};

interface ChatMessageData {
  id: string;
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
  status: MessageStatus;
}

interface ChatPanelProps {
  messages: ChatMessageData[];
  currentUser: User;
  onSendMessage: (content: string, type: MessageType) => void;
  title?: string;
  subtitle?: ReactNode;
  loading?: boolean;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ChatPanel({ messages, currentUser, onSendMessage, title, subtitle, loading }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('message');
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [inputValue]);

  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim(), messageType);
    setInputValue('');
    setMessageType('message');
    setShowEmoji(false);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const handleEmoji = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const rendered = useMemo(() => {
    const items: ReactNode[] = [];
    let prev: ChatMessageData | null = null;
    for (const msg of messages) {
      const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
      const curDay = new Date(msg.created_at).toDateString();
      const newDay = prevDay !== curDay;
      if (newDay) {
        items.push(<ChatDateSeparator key={`sep-${msg.id}`} label={dateLabel(msg.created_at)} />);
      }
      const isGrouped = !newDay && prev !== null && prev.sender?.id === msg.sender?.id;
      items.push(
        <ChatMessage
          key={msg.id}
          content={msg.content}
          sender={msg.sender}
          message_type={msg.message_type}
          created_at={msg.created_at}
          isOwn={msg.sender?.id === currentUser?.id}
          status={msg.status}
          isGrouped={isGrouped}
        />
      );
      prev = msg;
    }
    return items;
  }, [messages, currentUser.id]);

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-xl border border-gray-200">
      {(title || subtitle) && (
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 overscroll-contain">
        {loading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 text-primary-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Nenhuma mensagem ainda</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">Envie a primeira mensagem para começar a conversa com a equipe.</p>
          </div>
        ) : (
          rendered
        )}
      </div>

      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex gap-2 items-end">
          {/* Botões de tipo — compactos, ícone + label sutil */}
          <div className="flex gap-1 shrink-0 pb-0.5">
            {(['message', 'doubt', 'suggestion'] as MessageType[]).map(type => {
              const cfg = TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMessageType(type)}
                  title={cfg.label}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
                    messageType === type
                      ? 'bg-gray-100 text-gray-700 shadow-sm'
                      : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                  )}
                >
                  <cfg.icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          <div className="relative shrink-0" ref={emojiWrapRef}>
            {showEmoji && <EmojiPicker onSelect={handleEmoji} />}
            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
                showEmoji ? 'bg-primary-50 text-primary-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
              )}
              aria-label="Inserir emoji"
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          <textarea
            ref={taRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border-0 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-gray-200 placeholder:text-gray-400 max-h-[120px]"
          />

          <Button onClick={handleSend} disabled={!inputValue.trim()} size="icon" className="h-8 w-8 p-0 shrink-0 rounded-lg">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
