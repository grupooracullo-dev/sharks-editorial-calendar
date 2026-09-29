import { useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { LEAD_STAGES, STAGE_META, formatBRL, type LeadStage } from '@/lib/crmStages';
import type { Lead } from '@/hooks/useLeads';
import LeadCard from './LeadCard';

interface LeadKanbanProps {
  leads: Lead[];
  showEnv?: boolean;
  isMobile?: boolean;
  onOpenLead: (lead: Lead) => void;
  onMoveStage: (lead: Lead, stage: LeadStage) => void;
}

export default function LeadKanban({ leads, showEnv, isMobile, onOpenLead, onMoveStage }: LeadKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);

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
    <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1">
      {LEAD_STAGES.map(stage => {
        const meta = STAGE_META[stage];
        const columnLeads = leads.filter(l => l.stage === stage);
        const columnValue = columnLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
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
              'w-[264px] shrink-0 flex flex-col rounded-xl border transition-colors',
              isOver
                ? 'border-primary-300 bg-primary-50/70 ring-2 ring-primary-200'
                : 'border-gray-200 bg-gray-100/60',
            )}
          >
            {/* Header da coluna */}
            <div className="px-3 py-2.5 border-b border-gray-200/70 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 min-w-0">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dotClass)} />
                  <span className="truncate">{meta.label}</span>
                  <span className="text-xs font-medium text-gray-400">{columnLeads.length}</span>
                </span>
                {columnValue > 0 && (
                  <span className="text-[11px] font-medium text-gray-500 tabular-nums shrink-0">
                    {formatBRL(columnValue)}
                  </span>
                )}
              </div>
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
          </div>
        );
      })}
    </div>
  );
}
