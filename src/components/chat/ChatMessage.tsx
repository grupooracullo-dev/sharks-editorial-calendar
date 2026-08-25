import { User, MessageType } from '@/types';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  id: string;
  content: string;
  sender: User;
  message_type: MessageType;
  created_at: string;
  isOwn: boolean;
}

const typeLabels: Record<MessageType, { label: string; variant: 'primary' | 'warning' | 'info' }> = {
  message: { label: 'Mensagem', variant: 'primary' },
  doubt: { label: 'Dúvida', variant: 'warning' },
  suggestion: { label: 'Sugestão', variant: 'info' },
};

export default function ChatMessage({ content, sender, message_type, created_at, isOwn }: ChatMessageProps) {
  const time = new Date(created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const typeInfo = typeLabels[message_type];

  return (
    <div className={cn('flex gap-2.5 mb-4', isOwn && 'flex-row-reverse')}>
      <Avatar name={sender.full_name} size="sm" />
      <div className={cn('max-w-[75%]', isOwn && 'items-end flex flex-col')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-700">{isOwn ? 'Você' : sender.full_name}</span>
          <span className="text-[10px] text-gray-400">{time}</span>
          {message_type !== 'message' && (
            <Badge variant={typeInfo.variant} size="sm">{typeInfo.label}</Badge>
          )}
        </div>
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
            isOwn ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm'
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
