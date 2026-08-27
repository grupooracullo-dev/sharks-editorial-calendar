import { Action } from '@/types';
import { cn } from '@/lib/utils';
import { FORMAT_COLORS } from '@/lib/constants';
import { GripVertical, Users, Megaphone } from 'lucide-react';

interface CalendarEventProps {
  action: Action;
  onClick: () => void;
  compact?: boolean;
  showClient?: boolean;
  isDragging?: boolean;
}

export default function CalendarEvent({ action, onClick, compact, showClient, isDragging }: CalendarEventProps) {
  const formatLabel = action.format || action.action_type;
  const clientName = action.workspace?.name;
  const campaign = action.campaign;

  return (
    <button
      onClick={onClick}
      draggable
      className={cn(
        'w-full text-left rounded-md border px-2 py-1.5 transition-all duration-150 group cursor-pointer',
        FORMAT_COLORS[action.format || 'other'] || 'bg-gray-100 text-gray-700 border-gray-200',
        compact && 'py-1 px-1.5 text-xs',
        isDragging && 'opacity-50 ring-2 ring-primary-400',
        'hover:shadow-sm'
      )}
    >
      <div className="flex items-start gap-1">
        <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-40 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {!compact && action.action_time && (
            <span className="text-[10px] font-medium opacity-70 block leading-tight">
              {action.action_time.slice(0, 5)}
            </span>
          )}
          <p className={cn('font-medium leading-tight truncate', compact ? 'text-[10px]' : 'text-xs')}>
            {action.title}
          </p>
          {/* Badge de campanha */}
          {campaign && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-sm px-1 mt-0.5 leading-tight font-medium',
                compact ? 'text-[8px]' : 'text-[9px]'
              )}
              style={{
                backgroundColor: `${campaign.color || '#3B82F6'}20`,
                color: campaign.color || '#3B82F6',
              }}
            >
              <Megaphone className="w-2 h-2" />
              {campaign.name}
            </span>
          )}
          {showClient && clientName && (
            <span className={cn(
              'font-medium opacity-80 block leading-tight truncate text-primary-600',
              compact ? 'text-[9px]' : 'text-[10px]'
            )}>
              {clientName}
            </span>
          )}
          {!compact && (
            <span className="text-[10px] opacity-60 capitalize">{formatLabel}</span>
          )}
        </div>
      </div>
    </button>
  );
}
