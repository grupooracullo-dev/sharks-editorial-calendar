import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { createImplementation, updateImplementation, deleteImplementation } from '@/lib/estrategosService';
import { formatDate } from '@/lib/utils';
import type { EstrategosImplementation, EstrategosImplementationStatus, EstrategosProject, Workspace } from '@/types';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, CalendarSync } from 'lucide-react';

const STATUS_LABEL: Record<EstrategosImplementationStatus, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  pending: { label: 'Pendente', variant: 'default' },
  in_progress: { label: 'Em andamento', variant: 'info' },
  blocked: { label: 'Bloqueada', variant: 'danger' },
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'warning' },
};

const SYNC_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
  not_synced: { label: 'Não sincronizada', variant: 'default' },
  synced: { label: 'No Google Calendar', variant: 'success' },
  modified_after_sync: { label: 'Alterada após sync', variant: 'warning' },
  sync_error: { label: 'Erro de sync', variant: 'danger' },
};

export default function EstrategosImplementations() {
  const [impls, setImpls] = useState<EstrategosImplementation[]>([]);
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: EstrategosImplementation | null }>({ open: false, editing: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ workspace_id: '', project_id: '', name: '', description: '', system_name: '', status: 'pending', target_date: '' });

  useEffect(() => {
    const load = async () => {
      const [i, p, w] = await Promise.all([
        supabase.from('estrategos_implementations').select('*').order('created_at', { ascending: false }),
        supabase.from('estrategos_projects').select('id, name, workspace_id').neq('status', 'cancelled'),
        supabase.from('workspaces').select('*').eq('is_active', true).order('name'),
      ]);
      setImpls((i.data as unknown as EstrategosImplementation[]) ?? []);
      setProjects((p.data as unknown as EstrategosProject[]) ?? []);
      setWorkspaces((w.data as unknown as Workspace[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('estrategos-impls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_implementations' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openCreate = () => {
    setForm({ workspace_id: workspaces[0]?.id ?? '', project_id: '', name: '', description: '', system_name: '', status: 'pending', target_date: '' });
    setModal({ open: true, editing: null });
  };

  const openEdit = (i: EstrategosImplementation) => {
    setForm({
      workspace_id: i.workspace_id,
      project_id: i.project_id ?? '',
      name: i.name,
      description: i.description ?? '',
      system_name: i.system_name ?? '',
      status: i.status,
      target_date: i.target_date ?? '',
    });
    setModal({ open: true, editing: i });
  };

  const handleSave = async () => {
    if (!form.workspace_id || !form.name.trim()) {
      toast.error('Selecione o cliente e informe o nome');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: form.workspace_id,
        project_id: form.project_id || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        system_name: form.system_name.trim() || null,
        status: form.status as EstrategosImplementationStatus,
        target_date: form.target_date || null,
        completed_at: form.status === 'completed' ? new Date().toISOString() : null,
      };
      if (modal.editing) await updateImplementation(modal.editing.id, payload);
      else await createImplementation(payload);
      toast.success(modal.editing ? 'Implantação atualizada.' : 'Implantação criada.');
      setModal({ open: false, editing: null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (i: EstrategosImplementation) => {
    if (!window.confirm(`Excluir a implantação "${i.name}"?`)) return;
    try {
      await deleteImplementation(i.id);
      toast.success('Implantação excluída.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const wsName = (id: string) => workspaces.find(w => w.id === id)?.name ?? '—';
  const projName = (id: string | null) => (id ? projects.find(p => p.id === id)?.name : null);
  const projOptions = (wsId: string) => [{ value: '', label: 'Nenhum' }, ...projects.filter(p => p.workspace_id === wsId).map(p => ({ value: p.id, label: p.name }))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Implantações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Implantação de sistemas — marcos sincronizados com o Google Calendar</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nova implantação</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : impls.length === 0 ? (
          <p className="text-sm text-gray-500 py-12 text-center">Nenhuma implantação ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {impls.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{i.name}</p>
                    <Badge variant={STATUS_LABEL[i.status].variant} size="sm">{STATUS_LABEL[i.status].label}</Badge>
                    <Badge variant={SYNC_LABEL[i.sync_status]?.variant ?? 'default'} size="sm">
                      <CalendarSync className="w-3 h-3 mr-1" />
                      {SYNC_LABEL[i.sync_status]?.label ?? i.sync_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {i.system_name ? `${i.system_name} · ` : ''}{wsName(i.workspace_id)}
                    {projName(i.project_id) && ` · ${projName(i.project_id)}`}
                    {i.target_date && ` · ${formatDate(i.target_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(i)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(i)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, editing: null })} title={modal.editing ? 'Editar implantação' : 'Nova implantação'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Cliente"
              value={form.workspace_id}
              onChange={e => setForm(f => ({ ...f, workspace_id: e.target.value, project_id: '' }))}
              options={workspaces.map(w => ({ value: w.id, label: w.name }))}
              required
            />
            <Select
              label="Projeto (opcional)"
              value={form.project_id}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
              options={projOptions(form.workspace_id)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Nome"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Implantação ERP"
              required
            />
            <Input
              label="Sistema"
              value={form.system_name}
              onChange={e => setForm(f => ({ ...f, system_name: e.target.value }))}
              placeholder="Ex.: Bling, RD Station..."
            />
            <Input
              label="Data alvo"
              type="date"
              value={form.target_date}
              onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
            />
          </div>
          <Select
            label="Status"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            options={Object.entries(STATUS_LABEL).map(([v, m]) => ({ value: v, label: m.label }))}
          />
          <Textarea
            label="Descrição"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{modal.editing ? 'Salvar' : 'Criar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
