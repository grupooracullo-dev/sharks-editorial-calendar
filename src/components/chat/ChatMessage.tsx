import { User, MessageType, MessageStatus } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
  isOwn: boolean;
  status?: MessageStatus;
  isGrouped?: boolean;
}

const typeLabels: Record<MessageType, { label: string; variant: 'primary' | 'warning' | 'info' }> = {
  message: { label: 'Mensagem', variant: 'primary' },
  doubt: { label: 'Dúvida', variant: 'warning' },
  suggestion: { label: 'Sugestão', variant: 'info' },
};

export default function ChatMessage({ content, sender, message_type, created_at, isOwn, status, isGrouped }: ChatMessageProps) {
  const date = new Date(created_at);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const full = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const typeInfo = typeLabels[message_type];
  const showHeader = !isGrouped;
  const showMeta = showHeader || message_type !== 'message';

  return (
    <div className={cn('flex gap-2 sm:gap-2.5', isOwn && 'flex-row-reverse', isGrouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-7 sm:w-8 shrink-0">
        {showHeader && <Avatar name={sender.full_name} src={sender.avatar_url} size="sm" />}
      </div>
      <div className={cn('max-w-[85%] sm:max-w-[75%] flex flex-col min-w-0', isOwn && 'items-end')}>
        {showMeta && (
          <div className={cn('flex items-center gap-2 mb-1', isOwn && 'flex-row-reverse')}>
            {showHeader && (
              <span className="text-xs font-medium text-gray-700">{isOwn ? 'Você' : sender.full_name}</span>
            )}
            {message_type !== 'message' && (
              <Badge variant={typeInfo.variant} size="sm">{typeInfo.label}</Badge>
            )}
          </div>
        )}
        <div
          className={cn(
            'px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap',
            isOwn ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'
          )}
        >
          {content}
        </div>
        <div className={cn('flex items-center gap-1 mt-0.5', isOwn ? 'justify-end' : 'justify-start')} title={full}>
          <span className="text-[10px] text-gray-400">{time}</span>
          {isOwn && (
            status === 'read'
              ? <CheckCheck className="w-3.5 h-3.5 text-primary-500" aria-label="Lida" />
              : <Check className="w-3.5 h-3.5 text-gray-400" aria-label="Enviada" />
          )}
        </div>
      </div>
    </div>
  );
}
