import { useEffect, useState } from 'react';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { createProject, updateProject, deleteProject } from '@/lib/estrategosService';
import { formatDate } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { EstrategosProject, EstrategosProjectStatus } from '@/types';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

const STATUS_LABEL: Record<EstrategosProjectStatus, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  planning: { label: 'Planejamento', variant: 'default' },
  active: { label: 'Ativo', variant: 'primary' },
  paused: { label: 'Pausado', variant: 'warning' },
  completed: { label: 'Concluído', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

export default function EstrategosProjects() {
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [loading, setLoading] = useState(true);
  const { workspacesByEnv } = useWorkspace();
  const workspaces = workspacesByEnv('estrategos');
  const [modal, setModal] = useState<{ open: boolean; editing: EstrategosProject | null }>({ open: false, editing: null });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deletingConfirm, setDeletingConfirm] = useState(false);
  const [form, setForm] = useState({ workspace_id: '', name: '', description: '', status: 'planning', start_date: '', end_date: '' });

  useEffect(() => {
    const load = async () => {
      const p = await supabase.from('estrategos_projects').select('*').order('created_at', { ascending: false });
      setProjects((p.data as unknown as EstrategosProject[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('estrategos-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_projects' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openCreate = () => {
    setForm({ workspace_id: workspaces[0]?.id ?? '', name: '', description: '', status: 'planning', start_date: '', end_date: '' });
    setModal({ open: true, editing: null });
  };

  const openEdit = (p: EstrategosProject) => {
    setForm({
      workspace_id: p.workspace_id,
      name: p.name,
      description: p.description ?? '',
      status: p.status,
      start_date: p.start_date ?? '',
      end_date: p.end_date ?? '',
    });
    setModal({ open: true, editing: p });
  };

  const handleSave = async () => {
    if (!form.workspace_id || !form.name.trim()) {
      toast.error('Selecione o cliente e informe o nome do projeto');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: form.workspace_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status as EstrategosProjectStatus,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      if (modal.editing) await updateProject(modal.editing.id, payload);
      else await createProject(payload);
      toast.success(modal.editing ? 'Projeto atualizado.' : 'Projeto criado.');
      setModal({ open: false, editing: null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingConfirm(true);
    try {
      await deleteProject(deleting.id);
      toast.success('Projeto excluído.');
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingConfirm(false);
    }
  };

  const wsName = (id: string) => workspaces.find(w => w.id === id)?.name ?? '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Projetos de gestão empresarial</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Novo projeto</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-gray-500 py-12 text-center">Nenhum projeto ainda. Crie o primeiro!</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {projects.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <Badge variant={STATUS_LABEL[p.status].variant} size="sm">{STATUS_LABEL[p.status].label}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {wsName(p.workspace_id)}
                    {p.start_date && ` · ${formatDate(p.start_date)}`}
                    {p.end_date && ` → ${formatDate(p.end_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleting({ id: p.id, name: p.name })} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, editing: null })} title={modal.editing ? 'Editar projeto' : 'Novo projeto'}>
        <div className="space-y-4">
          <Select
            label="Cliente"
            value={form.workspace_id}
            onChange={e => setForm(f => ({ ...f, workspace_id: e.target.value }))}
            options={workspaces.map(w => ({ value: w.id, label: w.name }))}
            required
          />
          <Input
            label="Nome do projeto"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex.: Reestruturação financeira"
            required
          />
          <Textarea
            label="Descrição"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
          />
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Status"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              options={Object.entries(STATUS_LABEL).map(([v, m]) => ({ value: v, label: m.label }))}
            />
            <Input
              label="Início"
              type="date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            />
            <Input
              label="Fim"
              type="date"
              value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{modal.editing ? 'Salvar' : 'Criar'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Confirmar exclusão" size="sm">
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir <strong>{deleting?.name}</strong>?
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button variant="danger" loading={deletingConfirm} onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
