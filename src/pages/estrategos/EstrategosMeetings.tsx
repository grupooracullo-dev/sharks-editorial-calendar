import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { createMeeting, updateMeeting, deleteMeeting } from '@/lib/estrategosService';
import { formatDate } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { EstrategosMeeting, EstrategosMeetingStatus, EstrategosProject } from '@/types';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, CalendarSync } from 'lucide-react';

const STATUS_LABEL: Record<EstrategosMeetingStatus, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  scheduled: { label: 'Agendada', variant: 'info' },
  completed: { label: 'Realizada', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
};

const SYNC_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
  not_synced: { label: 'Não sincronizada', variant: 'default' },
  synced: { label: 'No Google Calendar', variant: 'success' },
  modified_after_sync: { label: 'Alterada após sync', variant: 'warning' },
  sync_error: { label: 'Erro de sync', variant: 'danger' },
};

export default function EstrategosMeetings() {
  const [meetings, setMeetings] = useState<EstrategosMeeting[]>([]);
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [loading, setLoading] = useState(true);
  const { workspacesByEnv } = useWorkspace();
  const workspaces = workspacesByEnv('estrategos');
  const [modal, setModal] = useState<{ open: boolean; editing: EstrategosMeeting | null }>({ open: false, editing: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ workspace_id: '', project_id: '', title: '', description: '', meeting_date: '', meeting_time: '', duration_minutes: 60, location: '', status: 'scheduled' });

  useEffect(() => {
    const load = async () => {
      const [m, p] = await Promise.all([
        supabase.from('estrategos_meetings').select('*').order('meeting_date', { ascending: false }),
        supabase.from('estrategos_projects').select('id, name, workspace_id').neq('status', 'cancelled'),
      ]);
      setMeetings((m.data as unknown as EstrategosMeeting[]) ?? []);
      setProjects((p.data as unknown as EstrategosProject[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('estrategos-meetings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_meetings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openCreate = () => {
    setForm({ workspace_id: workspaces[0]?.id ?? '', project_id: '', title: '', description: '', meeting_date: '', meeting_time: '', duration_minutes: 60, location: '', status: 'scheduled' });
    setModal({ open: true, editing: null });
  };

  const openEdit = (m: EstrategosMeeting) => {
    setForm({
      workspace_id: m.workspace_id,
      project_id: m.project_id ?? '',
      title: m.title,
      description: m.description ?? '',
      meeting_date: m.meeting_date,
      meeting_time: m.meeting_time?.slice(0, 5) ?? '',
      duration_minutes: m.duration_minutes,
      location: m.location ?? '',
      status: m.status,
    });
    setModal({ open: true, editing: m });
  };

  const handleSave = async () => {
    if (!form.workspace_id || !form.title.trim() || !form.meeting_date) {
      toast.error('Cliente, título e data são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workspace_id: form.workspace_id,
        project_id: form.project_id || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        meeting_date: form.meeting_date,
        meeting_time: form.meeting_time ? `${form.meeting_time}:00` : null,
        duration_minutes: Number(form.duration_minutes) || 60,
        location: form.location.trim() || null,
        status: form.status as EstrategosMeetingStatus,
      };
      if (modal.editing) await updateMeeting(modal.editing.id, payload);
      else await createMeeting(payload);
      toast.success(modal.editing ? 'Reunião atualizada.' : 'Reunião criada.');
      setModal({ open: false, editing: null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: EstrategosMeeting) => {
    if (!window.confirm(`Excluir a reunião "${m.title}"?`)) return;
    try {
      await deleteMeeting(m.id);
      toast.success('Reunião excluída.');
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
          <h1 className="text-2xl font-bold text-gray-900">Reuniões</h1>
          <p className="text-sm text-gray-500 mt-0.5">Agenda de reuniões — sincronizada com o Google Calendar</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nova reunião</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-gray-500 py-12 text-center">Nenhuma reunião ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {meetings.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{m.title}</p>
                    <Badge variant={STATUS_LABEL[m.status].variant} size="sm">{STATUS_LABEL[m.status].label}</Badge>
                    <Badge variant={SYNC_LABEL[m.sync_status]?.variant ?? 'default'} size="sm">
                      <CalendarSync className="w-3 h-3 mr-1" />
                      {SYNC_LABEL[m.sync_status]?.label ?? m.sync_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {formatDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ''} · {m.duration_minutes}min · {wsName(m.workspace_id)}
                    {projName(m.project_id) && ` · ${projName(m.project_id)}`}
                    {m.location && ` · ${m.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(m)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(m)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, editing: null })} title={modal.editing ? 'Editar reunião' : 'Nova reunião'} size="lg">
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
          <Input
            label="Título"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ex.: Reunião de planejamento trimestral"
            required
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="Data"
              type="date"
              value={form.meeting_date}
              onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))}
              required
            />
            <Input
              label="Hora"
              type="time"
              value={form.meeting_time}
              onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
            />
            <Input
              label="Duração (min)"
              type="number"
              min={15}
              step={15}
              value={form.duration_minutes}
              onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              options={Object.entries(STATUS_LABEL).map(([v, m]) => ({ value: v, label: m.label }))}
            />
          </div>
          <Input
            label="Local"
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="Ex.: Google Meet / Escritório"
          />
          <Textarea
            label="Pauta"
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
