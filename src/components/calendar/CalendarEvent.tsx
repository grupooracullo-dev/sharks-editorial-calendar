import { useState } from 'react';
import { Action } from '@/types';
import { cn } from '@/lib/utils';
import { FORMAT_COLORS, ACTION_STATUSES } from '@/lib/constants';
import { isOverdue } from '@/lib/dateUtils';
import { GripVertical, Megaphone, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface CalendarEventProps {
  action: Action;
  onClick: () => void;
  onQuickStatus?: (action: Action, status: Action['status']) => void;
  compact?: boolean;
  showClient?: boolean;
  isDragging?: boolean;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-gray-400',
  briefing: 'bg-blue-500',
  in_production: 'bg-yellow-500',
  sharks_review: 'bg-purple-500',
  scheduled: 'bg-indigo-500',
  published: 'bg-green-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
  overdue: 'bg-orange-500',
};

const NEXT_STATUS: Record<string, { status: Action['status']; label: string; icon: typeof CheckCircle2 }> = {
  draft: { status: 'briefing', label: 'Briefing', icon: Clock },
  briefing: { status: 'in_production', label: 'Produção', icon: Clock },
  in_production: { status: 'sharks_review', label: 'Revisão', icon: Clock },
  sharks_review: { status: 'scheduled', label: 'Programar', icon: CheckCircle2 },
  scheduled: { status: 'published', label: 'Publicar', icon: CheckCircle2 },
};

export default function CalendarEvent({ action, onClick, onQuickStatus, compact, showClient, isDragging }: CalendarEventProps) {
  const [hovered, setHovered] = useState(false);
  const formatLabel = action.format || action.action_type;
  const clientName = action.workspace?.name;
  const campaign = action.campaign;
  const overdue = isOverdue(action.action_date, action.status);
  const statusConf = ACTION_STATUSES[action.status] || ACTION_STATUSES.draft;
  const next = NEXT_STATUS[action.status];

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        draggable
        className={cn(
          'w-full text-left rounded-md border px-2 py-1.5 transition-all duration-150 group cursor-pointer',
          FORMAT_COLORS[action.format || 'other'] || 'bg-gray-100 text-gray-700 border-gray-200',
          compact && 'py-1 px-1.5 text-xs',
          isDragging && 'opacity-50 ring-2 ring-primary-400',
          overdue && !['published', 'completed', 'cancelled'].includes(action.status) && 'ring-2 ring-red-400 ring-offset-1',
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
            <div className="flex items-center gap-1">
              {/* Status dot */}
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT_COLORS[action.status] || 'bg-gray-400')} />
              <p className={cn('font-medium leading-tight truncate', compact ? 'text-[10px]' : 'text-xs')}>
                {action.title}
              </p>
              {overdue && !['published', 'completed', 'cancelled'].includes(action.status) && (
                <AlertTriangle className="w-2.5 h-2.5 text-red-500 flex-shrink-0 animate-pulse" />
              )}
            </div>
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

      {/* Hover preview popover */}
      {hovered && !isDragging && !compact && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-3 pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[action.status])} />
            <span className="text-xs font-semibold text-gray-900 truncate">{action.title}</span>
          </div>
          <div className="space-y-1 text-[11px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{action.action_date}{action.action_time ? ` às ${action.action_time.slice(0, 5)}` : ''}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT_COLORS[action.status])} />
              <span>{statusConf.label}</span>
              <span className="text-gray-300">·</span>
              <span className="capitalize">{formatLabel}</span>
            </div>
            {action.objective && (
              <p className="text-gray-400 truncate">{action.objective}</p>
            )}
            {campaign && (
              <div className="flex items-center gap-1.5">
                <Megaphone className="w-3 h-3" style={{ color: campaign.color || '#3B82F6' }} />
                <span style={{ color: campaign.color || '#3B82F6' }}>{campaign.name}</span>
              </div>
            )}
          </div>
          {/* Quick status advance */}
          {next && onQuickStatus && (
            <div className="mt-2 pt-2 border-t border-gray-100 pointer-events-auto">
              <button
                onClick={(e) => { e.stopPropagation(); onQuickStatus(action, next.status); }}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors"
              >
                <next.icon className="w-3 h-3" />
                Avançar para {next.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
