import { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import type { EstrategosProject } from '@/types';
import { Building2, Briefcase, Presentation, Rocket, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

export default function EstrategosClients() {
  const { workspacesByEnv } = useWorkspace();
  const wsList = workspacesByEnv('estrategos');
  const [projects, setProjects] = useState<EstrategosProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; wsId: string; wsName: string }>({ open: false, wsId: '', wsName: '' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('estrategos_projects').select('*');
      setProjects((data as unknown as EstrategosProject[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('estrategos-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estrategos_projects' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('estrategos_projects').insert({ workspace_id: modal.wsId, name: name.trim(), status: 'planning' });
      if (error) throw error;
      toast.success('Projeto criado.');
      setModal({ open: false, wsId: '', wsName: '' });
      setName('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Empresas atendidas pela Estrategos</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : wsList.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhum cliente Estrategos ainda.</p>
            <p className="text-xs text-gray-400 mt-1">O admin Oracullo pode criar workspaces vinculados à organização Estrategos.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wsList.map(ws => {
            const wsProjects = projects.filter(p => p.workspace_id === ws.id);
            const active = wsProjects.filter(p => p.status === 'active').length;
            return (
              <Card key={ws.id} hover padding="md">
                <div className="flex items-start justify-between mb-3">
                  <Avatar name={ws.name} size="md" />
                  <Badge variant="success" size="sm">Ativo</Badge>
                </div>
                <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                <p className="text-xs text-gray-500 mb-3">{ws.segment ?? 'Gestão'}{ws.city ? ` · ${ws.city}` : ''}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Briefcase className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{wsProjects.length}</p>
                    <p className="text-[10px] text-gray-400">Projetos</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Rocket className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{active}</p>
                    <p className="text-[10px] text-gray-400">Ativos</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <Presentation className="w-4 h-4 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-sm font-semibold text-gray-900">{formatDate(ws.created_at).slice(-4)}</p>
                    <p className="text-[10px] text-gray-400">Desde</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setModal({ open: true, wsId: ws.id, wsName: ws.name })}
                >
                  <Plus className="w-4 h-4" /> Novo projeto
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, wsId: '', wsName: '' })} title={`Novo projeto — ${modal.wsName}`}>
        <div className="space-y-4">
          <Input
            label="Nome do projeto"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex.: Implantação de gestão financeira"
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, wsId: '', wsName: '' })}>Cancelar</Button>
            <Button onClick={handleCreate} loading={saving}>Criar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
