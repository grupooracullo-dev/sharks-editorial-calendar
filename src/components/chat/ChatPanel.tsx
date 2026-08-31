import { useState, useRef, useEffect, useMemo, ReactNode } from 'react';
import { User, MessageType, MessageStatus } from '@/types';
import ChatMessage from './ChatMessage';
import ChatDateSeparator from './ChatDateSeparator';
import ChatSkeleton from './ChatSkeleton';
import EmojiPicker from '@/components/ui/EmojiPicker';
import Button from '@/components/ui/Button';
import { Send, Smile, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      const isGrouped = !newDay && prev !== null && prev.sender.id === msg.sender.id;
      items.push(
        <ChatMessage
          key={msg.id}
          content={msg.content}
          sender={msg.sender}
          message_type={msg.message_type}
          created_at={msg.created_at}
          isOwn={msg.sender.id === currentUser.id}
          status={msg.status}
          isGrouped={isGrouped}
        />
      );
      prev = msg;
    }
    return items;
  }, [messages, currentUser.id]);

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      {(title || subtitle) && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
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
                  ? 'bg-primary-100 text-primary-700 font-medium'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              {labels[type]}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        <div className="flex gap-2 items-end">
          <div className="relative shrink-0" ref={emojiWrapRef}>
            {showEmoji && <EmojiPicker onSelect={handleEmoji} />}
            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              className={cn(
                'h-[42px] w-[42px] flex items-center justify-center rounded-xl border transition-colors',
                showEmoji ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
              aria-label="Inserir emoji"
            >
              <Smile className="w-5 h-5" />
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
            className="flex-1 px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 max-h-[120px]"
          />
          <Button onClick={handleSend} disabled={!inputValue.trim()} size="icon" className="h-[42px] w-[42px] p-0 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
