import type { DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { Building2, Sparkles } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { ACTIVITY_TYPE_META, formatBRL, formatRelativeTime } from '@/lib/crmStages';
import type { Lead, LeadActivitySummary } from '@/hooks/useLeads';
import { ENVIRONMENT_META } from '@/types';

const NEXT_STEP_LABELS: Record<string, string> = {
  pesquisar_mais: 'Pesquisar mais',
  qualificar: 'Qualificar',
  descartar: 'Descartar',
  abordar: 'Abordar',
};

const ORIGIN_LABELS: Record<string, string> = {
  prospecting_agent: 'Prospecção',
  inbound: 'Inbound',
  import: 'Importado',
};

interface LeadCardProps {
  lead: Lead;
  draggable: boolean;
  dragging: boolean;
  showEnv?: boolean;
  lastActivity: LeadActivitySummary | null;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export default function LeadCard({
  lead, draggable, dragging, showEnv, lastActivity, onOpen, onDragStart, onDragEnd,
}: LeadCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-3 text-left cursor-pointer transition-all',
        'hover:border-gray-300 hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      {/* Nome + ambiente */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug break-words flex-1">{lead.name}</p>
        {showEnv && (
          <span className="text-xs shrink-0 mt-0.5" title={ENVIRONMENT_META[lead.environment].label}>
            {ENVIRONMENT_META[lead.environment].emoji}
          </span>
        )}
      </div>

      {/* Valor em destaque (padrão pipeline) */}
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className={cn('text-sm', lead.value != null ? 'font-semibold text-gray-800' : 'text-gray-400')}>
          Valor: {lead.value != null ? formatBRL(lead.value) : '—'}
        </span>
        {lead.monthly_value != null && (
          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
            {formatBRL(lead.monthly_value)}/mês
          </span>
        )}
      </div>

      {/* Próximo passo da IA + origem */}
      {(lead.ai_next_step || (lead.origin && lead.origin !== 'manual')) && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {lead.ai_next_step && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-100 px-1.5 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 shrink-0" />
              {NEXT_STEP_LABELS[lead.ai_next_step] ?? lead.ai_next_step}
            </span>
          )}
          {lead.origin && lead.origin !== 'manual' && (
            <span className="text-[11px] text-gray-400">
              {ORIGIN_LABELS[lead.origin] ?? lead.origin}
              {lead.source ? ` · ${lead.source}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Cliente convertido */}
      {lead.workspace && (
        <span className="mt-1.5 inline-flex items-center gap-1 max-w-full text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{lead.workspace.name}</span>
        </span>
      )}

      {/* Responsável + tempo relativo */}
      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        {lead.owner ? (
          <Avatar name={lead.owner.full_name} src={lead.owner.avatar_url} size="xs" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-gray-100 shrink-0" />
        )}
        <span className="text-xs text-gray-500 truncate">
          {lead.owner?.full_name ?? 'Sem responsável'} · {formatRelativeTime(lead.updated_at)}
        </span>
      </div>

      {/* Última atividade */}
      <p className="text-xs text-gray-400 mt-1.5 truncate">
        {lastActivity
          ? `${ACTIVITY_TYPE_META[lastActivity.type]?.label ?? lastActivity.type}: ${lastActivity.content}`
          : 'Nenhuma atividade'}
      </p>
    </div>
  );
}
