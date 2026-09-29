import { useCallback, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Textarea from '@/components/ui/Textarea';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import { Plus, Target, Loader2 } from 'lucide-react';
import LeadKanban from './LeadKanban';
import LeadFormModal, { type LeadFormValues } from './LeadFormModal';
import LeadDrawer from './LeadDrawer';
import ConvertLeadModal from './ConvertLeadModal';
import { formatBRL, type LeadStage } from '@/lib/crmStages';
import {
  useLeads, useEnvStaff, type CrmEnvironment, type Lead,
} from '@/hooks/useLeads';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface CrmBoardProps {
  environment: CrmEnvironment | null;
  canDelete?: boolean;
  showEnv?: boolean;
  title: string;
  subtitle: string;
}

export default function CrmBoard({ environment, canDelete = false, showEnv = false, title, subtitle }: CrmBoardProps) {
  const { isMobile } = useBreakpoint();
  const { leads, loading, createLead, updateLead, deleteLead, moveStage, convertLead } = useLeads(environment);
  const owners = useEnvStaff(environment);

  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [convertLeadState, setConvertLeadState] = useState<Lead | null>(null);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stats = useMemo(() => {
    const open = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
    const won = leads.filter(l => l.stage === 'won');
    return {
      pipelineValue: open.reduce((acc, l) => acc + (Number(l.value) || 0), 0),
      openCount: open.length,
      wonValue: won.reduce((acc, l) => acc + (Number(l.value) || 0), 0),
      monthlyValue: won.reduce((acc, l) => acc + (Number(l.monthly_value) || 0), 0),
      wonCount: won.length,
    };
  }, [leads]);

  /* O drawer guarda referência viva do lead (realtime pode atualizá-lo) */
  const drawerLive: Lead | null = drawerLead
    ? leads.find(l => l.id === drawerLead.id) ?? drawerLead
    : null;

  const handleMoveStage = useCallback(async (lead: Lead, stage: LeadStage) => {
    if (lead.stage === stage) return;
    if (stage === 'won' && !lead.workspace_id) {
      setDrawerLead(null);
      setConvertLeadState(lead);
      return;
    }
    if (stage === 'lost') {
      setDrawerLead(null);
      setLostLead(lead);
      setLostReason('');
      return;
    }
    try {
      await moveStage(lead, stage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao mover lead');
    }
  }, [moveStage]);

  const handleCreateOrUpdate = async (values: LeadFormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        contact_name: values.contact_name.trim() || null,
        contact_email: values.contact_email.trim() || null,
        contact_phone: values.contact_phone.trim() || null,
        source: values.source.trim() || null,
        segment: values.segment.trim() || null,
        value: values.value === '' ? null : Number(values.value),
        monthly_value: values.monthly_value === '' ? null : Number(values.monthly_value),
        expected_close_date: values.expected_close_date || null,
        owner_id: values.owner_id || null,
        notes: values.notes.trim() || null,
      };
      if (editingLead) {
        await updateLead(editingLead.id, payload);
        toast.success('Lead atualizado!');
      } else {
        if (!environment) {
          toast.error('Selecione um ambiente para criar o lead.');
          return;
        }
        await createLead({ ...payload, environment });
        toast.success('Lead criado!');
      }
      setFormOpen(false);
      setEditingLead(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async (workspaceName: string, segment: string) => {
    if (!convertLeadState) return;
    setSubmitting(true);
    try {
      const res = await convertLead(convertLeadState.id, workspaceName, segment);
      toast.success(`Cliente "${res.workspace_name}" criado! O acesso dele segue pelo fluxo de solicitação de acesso.`);
      setConvertLeadState(null);
      setDrawerLead(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao converter lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLostConfirm = async () => {
    if (!lostLead) return;
    setSubmitting(true);
    try {
      await moveStage(lostLead, 'lost');
      await updateLead(lostLead.id, { lost_reason: lostReason.trim() || null });
      toast.success('Lead marcado como perdido');
      setLostLead(null);
      setLostReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLead) return;
    setSubmitting(true);
    try {
      await deleteLead(deletingLead.id);
      toast.success('Lead excluído');
      setDeletingLead(null);
      setDrawerLead(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <Button onClick={() => { setEditingLead(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4" />
              Novo lead
            </Button>
          }
        />
      </div>

      {/* Resumo */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-500">
          Pipeline aberto: <strong className="text-gray-900 tabular-nums">{formatBRL(stats.pipelineValue)}</strong>
          <span className="text-gray-400"> ({stats.openCount} leads)</span>
        </span>
        <span className="text-gray-500">
          Ganho: <strong className="text-emerald-600 tabular-nums">{formatBRL(stats.wonValue)}</strong>
          <span className="text-gray-400"> ({stats.wonCount} {stats.wonCount === 1 ? 'lead' : 'leads'})</span>
        </span>
        <span className="text-gray-500">
          Recorrência mensal: <strong className="text-gray-900 tabular-nums">{formatBRL(stats.monthlyValue)}</strong>
        </span>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card padding="md">
            <EmptyState
              icon={Target}
              title="Nenhum lead ainda"
              description="Crie o primeiro lead para começar a acompanhar a jornada até a conversão."
            />
            <div className="flex justify-center pb-2 -mt-2">
              <Button onClick={() => { setEditingLead(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4" />
                Novo lead
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <LeadKanban
          leads={leads}
          showEnv={showEnv}
          isMobile={isMobile}
          onOpenLead={(lead) => setDrawerLead(lead)}
          onMoveStage={handleMoveStage}
        />
      )}

      {/* Form criar/editar */}
      <LeadFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingLead(null); }}
        lead={editingLead}
        owners={owners}
        submitting={submitting}
        onSubmit={handleCreateOrUpdate}
      />

      {/* Detalhe do lead */}
      <LeadDrawer
        lead={drawerLive}
        owners={owners}
        canDelete={canDelete}
        onClose={() => setDrawerLead(null)}
        onEdit={(lead) => { setEditingLead(lead); setFormOpen(true); }}
        onStageChange={handleMoveStage}
        onConvert={(lead) => { setDrawerLead(null); setConvertLeadState(lead); }}
        onDelete={(lead) => setDeletingLead(lead)}
      />

      {/* Conversão */}
      <ConvertLeadModal
        lead={convertLeadState}
        submitting={submitting}
        onClose={() => setConvertLeadState(null)}
        onConfirm={handleConvert}
      />

      {/* Marcar como perdido */}
      <Modal
        isOpen={!!lostLead}
        onClose={() => setLostLead(null)}
        title="Marcar como perdido"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {lostLead?.name} será movido para <strong>Perdido</strong>.
          </p>
          <Textarea
            label="Motivo (opcional)"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Preço, concorrência, sem verba..."
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setLostLead(null)}>Cancelar</Button>
          <Button variant="danger" onClick={handleLostConfirm} loading={submitting}>
            Marcar como perdido
          </Button>
        </div>
      </Modal>

      {/* Confirmar exclusão */}
      <Modal
        isOpen={!!deletingLead}
        onClose={() => setDeletingLead(null)}
        title="Excluir lead"
        size="sm"
      >
        <p className="text-sm text-gray-600">
          Excluir <strong>{deletingLead?.name}</strong> e todo o histórico de atividades?
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setDeletingLead(null)}>Cancelar</Button>
          <Button variant="danger" onClick={handleDeleteConfirm} loading={submitting}>
            Excluir
          </Button>
        </div>
      </Modal>
    </div>
  );
}
