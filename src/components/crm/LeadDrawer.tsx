import { useState } from 'react';
import Drawer from '@/components/ui/Drawer';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  Building2, Calendar, Mail, Phone, StickyNote, ArrowRight, Info,
  Trash2, Pencil, TrendingUp, Send, MessageSquare, Loader2,
} from 'lucide-react';
import {
  LEAD_STAGES, STAGE_META, ACTIVITY_TYPE_META, formatBRL, type LeadStage,
} from '@/lib/crmStages';
import { useLeadActivities, type Lead, type LeadActivity } from '@/hooks/useLeads';
import { ENVIRONMENT_META } from '@/types';

const ACTIVITY_ICONS: Record<LeadActivity['type'], typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  meeting: Calendar,
  email: Mail,
  stage_change: ArrowRight,
  system: Info,
};

interface LeadDrawerProps {
  lead: Lead | null;
  owners: { value: string; label: string }[];
  canDelete: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onStageChange: (lead: Lead, stage: LeadStage) => void;
  onConvert: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}

export default function LeadDrawer({
  lead, owners, canDelete, onClose, onEdit, onStageChange, onConvert, onDelete,
}: LeadDrawerProps) {
  const { activities, loading: activitiesLoading, addActivity } = useLeadActivities(lead?.id ?? null);
  const [activityType, setActivityType] = useState<LeadActivity['type']>('note');
  const [activityText, setActivityText] = useState('');
  const [sendingActivity, setSendingActivity] = useState(false);

  if (!lead) return null;

  const stageMeta = STAGE_META[lead.stage];
  const ownerName = lead.owner?.full_name ?? owners.find(o => o.value === lead.owner_id)?.label ?? null;

  const handleAddActivity = async () => {
    if (!activityText.trim()) return;
    setSendingActivity(true);
    try {
      await addActivity(activityType, activityText);
      setActivityText('');
    } finally {
      setSendingActivity(false);
    }
  };

  return (
    <Drawer isOpen={!!lead} onClose={onClose} title={lead.name} width="lg">
      <div className="space-y-5">
        {/* Etapa */}
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', stageMeta.badgeClass)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', stageMeta.dotClass)} />
            {stageMeta.label}
          </span>
          {showEnvBadge(lead)}
        </div>
        <Select
          label="Mover etapa"
          value={lead.stage}
          onChange={(e) => onStageChange(lead, e.target.value as LeadStage)}
          options={LEAD_STAGES.map(s => ({ value: s, label: STAGE_META[s].label }))}
        />

        {/* Cliente convertido */}
        {lead.workspace && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-700">Cliente na agenda</p>
              <p className="text-sm text-emerald-900 truncate">{lead.workspace.name}</p>
            </div>
          </div>
        )}

        {/* Motivo da perda */}
        {lead.stage === 'lost' && lead.lost_reason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-700 mb-0.5">Motivo da perda</p>
            <p className="text-sm text-red-700">{lead.lost_reason}</p>
          </div>
        )}

        {/* Produtos de interesse */}
        {(lead.products?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Produtos de interesse</p>
            <div className="flex flex-wrap gap-1.5">
              {lead.products!.map(x => (
                x.product && (
                  <span key={x.product.id} className="text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
                    {x.product.name}
                  </span>
                )
              ))}
            </div>
          </div>
        )}

        {/* Dados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <InfoRow label="Contato" value={lead.contact_name} />
          <InfoRow
            label="E-mail"
            value={lead.contact_email}
            icon={<Mail className="w-3.5 h-3.5 text-gray-400" />}
          />
          <InfoRow
            label="Telefone"
            value={lead.contact_phone}
            icon={<Phone className="w-3.5 h-3.5 text-gray-400" />}
          />
          <InfoRow label="Origem" value={lead.source} />
          <InfoRow label="Segmento" value={lead.segment} />
          <InfoRow label="Valor estimado" value={lead.value != null ? formatBRL(lead.value) : null} />
          <InfoRow
            label="Recorrência mensal"
            value={lead.monthly_value != null ? formatBRL(lead.monthly_value) : null}
            icon={<TrendingUp className="w-3.5 h-3.5 text-gray-400" />}
          />
          <InfoRow
            label="Previsão de fechamento"
            value={lead.expected_close_date ? new Date(lead.expected_close_date + 'T00:00:00').toLocaleDateString('pt-BR') : null}
            icon={<Calendar className="w-3.5 h-3.5 text-gray-400" />}
          />
          <InfoRow label="Responsável" value={ownerName} />
        </div>

        {lead.notes && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Observações</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{lead.notes}</p>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Button>
          {!lead.workspace && lead.stage !== 'won' && (
            <Button variant="success" size="sm" onClick={() => onConvert(lead)}>
              <Building2 className="w-3.5 h-3.5" />
              Converter em cliente
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => onDelete(lead)}>
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </Button>
          )}
        </div>

        {/* Timeline de atividades */}
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Atividades</h4>

          {activitiesLoading && activities.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-xs text-gray-400 italic mb-3">Nenhuma atividade registrada.</p>
          ) : (
            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
              {activities.map(a => {
                const Icon = ACTIVITY_ICONS[a.type] ?? Info;
                return (
                  <div key={a.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-gray-700">{ACTIVITY_TYPE_META[a.type]?.label ?? a.type}</span>
                        <span className="text-[11px] text-gray-400">
                          {a.author?.full_name ?? '—'} · {new Date(a.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{a.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Registrar atividade */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
              <Select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as LeadActivity['type'])}
                options={['note', 'call', 'meeting', 'email'].map(t => ({
                  value: t,
                  label: ACTIVITY_TYPE_META[t].label,
                }))}
                className="max-w-[160px]"
              />
            </div>
            <Textarea
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
              placeholder="Registrar interação com o lead..."
              rows={2}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddActivity} loading={sendingActivity} disabled={!activityText.trim()}>
                <Send className="w-3.5 h-3.5" />
                Registrar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function showEnvBadge(lead: Lead) {
  const meta = ENVIRONMENT_META[lead.environment];
  return <Badge variant="default" size="sm">{meta.emoji} {meta.short}</Badge>;
}

function InfoRow({ label, value, icon }: { label: string; value: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-gray-900 break-words">{value}</p>
    </div>
  );
}
