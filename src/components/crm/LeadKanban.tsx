import { useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { LEAD_STAGES, STAGE_META, formatBRL, type LeadStage } from '@/lib/crmStages';
import type { Lead, LeadActivitySummary, CrmClient } from '@/hooks/useLeads';
import LeadCard from './LeadCard';
import { Building2 } from 'lucide-react';
import { ENVIRONMENT_META } from '@/types';

interface LeadKanbanProps {
  leads: Lead[];
  clients: CrmClient[];
  activitySummaries: Map<string, LeadActivitySummary>;
  showEnv?: boolean;
  isMobile?: boolean;
  onOpenLead: (lead: Lead) => void;
  onMoveStage: (lead: Lead, stage: LeadStage) => void;
}

export default function LeadKanban({ leads, clients, activitySummaries, showEnv, isMobile, onOpenLead, onMoveStage }: LeadKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);

  const totalPipeline = leads
    .filter(l => l.stage !== 'won' && l.stage !== 'lost')
    .reduce((acc, l) => acc + (Number(l.value) || 0), 0);

  const handleDragStart = (lead: Lead) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(lead.id);
  };

  const handleDrop = (stage: LeadStage) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setOverStage(null);
    setDraggingId(null);
    const lead = leads.find(l => l.id === id);
    if (lead && lead.stage !== stage) onMoveStage(lead, stage);
  };

  return (
    <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1 xl:grid xl:grid-cols-7 xl:overflow-visible">
      {/* Colunas do funil */}
      {LEAD_STAGES.map(stage => {
        const meta = STAGE_META[stage];
        const columnLeads = leads.filter(l => l.stage === stage);
        const columnValue = columnLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
        const noValue = columnLeads.filter(l => l.value == null).length;
        const pct = totalPipeline > 0 ? Math.round((columnValue / totalPipeline) * 100) : 0;
        const isOver = overStage === stage && !!draggingId;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overStage !== stage) setOverStage(stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
            }}
            onDrop={handleDrop(stage)}
            className={cn(
              'w-[272px] shrink-0 xl:w-auto flex flex-col rounded-xl border transition-colors min-h-0',
              isOver
                ? 'border-primary-300 bg-primary-50/70 ring-2 ring-primary-200'
                : 'border-gray-200 bg-gray-100/60',
            )}
          >
            {/* Header da etapa */}
            <div className="px-3 py-2.5 border-b border-gray-200/70 shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dotClass)} />
                <span className="truncate">{meta.label}</span>
                <span className="text-gray-400">{columnLeads.length}</span>
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {columnLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  draggable={!isMobile}
                  dragging={draggingId === lead.id}
                  showEnv={showEnv}
                  lastActivity={activitySummaries.get(lead.id) ?? null}
                  onOpen={() => onOpenLead(lead)}
                  onDragStart={handleDragStart(lead)}
                  onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                />
              ))}
              {columnLeads.length === 0 && (
                <div
                  className={cn(
                    'rounded-lg border border-dashed py-8 text-center text-xs',
                    isOver ? 'border-primary-300 text-primary-500' : 'border-gray-200 text-gray-300',
                  )}
                >
                  {isOver ? 'Solte aqui' : 'Vazio'}
                </div>
              )}
            </div>

            {/* Rodapé: valor estimado da etapa */}
            <div
              className="px-3 py-2 border-t border-gray-200/70 bg-white/60 rounded-b-xl shrink-0"
              title="Soma dos valores estimados dos leads nesta etapa"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Valor estimado</span>
                <span className="font-semibold text-gray-800 tabular-nums">{formatBRL(columnValue)}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {columnLeads.length} {columnLeads.length === 1 ? 'lead' : 'leads'}
                {stage !== 'won' && stage !== 'lost' && columnValue > 0 && <> · {pct}% do funil</>}
                {noValue > 0 && <> · {noValue} sem valor</>}
              </p>
            </div>
          </div>
        );
      })}

      {/* Coluna CLIENTES ATIVOS — clientes cadastrados na agenda */}
      <div className="w-[240px] shrink-0 xl:w-auto flex flex-col rounded-xl border border-emerald-200/70 bg-emerald-50/40 min-h-0">
        <div className="px-3 py-2.5 border-b border-emerald-200/60 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 uppercase tracking-wide min-w-0">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Clientes ativos</span>
            <span className="text-emerald-400">{clients.length}</span>
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          {clients.map(c => (
            <div
              key={c.id}
              className="bg-white border border-gray-200 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate flex-1">{c.name}</p>
                {c.environment && (
                  <span className="text-xs shrink-0">{ENVIRONMENT_META[c.environment as keyof typeof ENVIRONMENT_META]?.emoji ?? ''}</span>
                )}
              </div>
              {c.segment && <p className="text-xs text-gray-500 truncate mt-0.5">{c.segment}</p>}
              <p className="text-[10px] font-medium text-emerald-600 mt-1.5">✓ cliente da agenda</p>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="rounded-lg border border-dashed border-emerald-200 py-8 text-center text-xs text-emerald-300">
              Nenhum cliente ainda
            </div>
          )}
        </div>
        <div className="px-3 py-2 border-t border-emerald-200/60 bg-white/60 rounded-b-xl shrink-0">
          <p className="text-[11px] text-gray-400">
            {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'} ativos na agenda
          </p>
        </div>
      </div>
    </div>
  );
}
