import type { DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { Building2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { STAGE_META, formatBRL } from '@/lib/crmStages';
import type { Lead } from '@/hooks/useLeads';
import { ENVIRONMENT_META } from '@/types';

interface LeadCardProps {
  lead: Lead;
  draggable: boolean;
  dragging: boolean;
  showEnv?: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export default function LeadCard({ lead, draggable, dragging, showEnv, onOpen, onDragStart, onDragEnd }: LeadCardProps) {
  const stage = STAGE_META[lead.stage];

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-3 text-left cursor-pointer transition-all',
        'hover:border-gray-300 hover:shadow-sm active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 truncate flex-1">{lead.name}</p>
        <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', stage.dotClass)} title={stage.label} />
      </div>

      {(lead.segment || lead.source) && (
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {[lead.segment, lead.source].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.owner && (
            <Avatar name={lead.owner.full_name} src={lead.owner.avatar_url} size="xs" />
          )}
          {lead.workspace && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full min-w-0">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{lead.workspace.name}</span>
            </span>
          )}
          {showEnv && (
            <span className="text-[11px] text-gray-400 shrink-0">
              {ENVIRONMENT_META[lead.environment].emoji}
            </span>
          )}
        </div>
        {lead.value != null && (
          <span className="text-xs font-semibold text-gray-700 tabular-nums shrink-0">
            {formatBRL(lead.value)}
          </span>
        )}
      </div>
    </div>
  );
}
