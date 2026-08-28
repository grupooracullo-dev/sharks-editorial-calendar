import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import WorkspaceLogo from '@/components/ui/WorkspaceLogo';
import Badge from '@/components/ui/Badge';
import ClientWizard from '@/components/clients/ClientWizard';
import ClientEditModal, { type ClientEditTarget } from '@/components/clients/ClientEditModal';
import { fetchAllClients, deactivateClient, type ClientWithOrg } from '@/lib/clientFactory';
import { ENVIRONMENT_META, type EnvironmentType } from '@/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Building2, MapPin, Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const ENVS: EnvironmentType[] = ['sharks_company', 'estrategos'];

export default function OraculloClients() {
  const [clients, setClients] = useState<ClientWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<ClientEditTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchAllClients();
      setClients(list);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('oracullo-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const clientEnv = (c: ClientWithOrg): EnvironmentType => c.organization?.environment ?? 'sharks_company';

  const envCount = (env: EnvironmentType) => clients.filter(c => clientEnv(c) === env).length;

  const handleDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      const target = clients.find(c => c.id === deleteConfirm);
      await deactivateClient(deleteConfirm);
      toast.success(`Cliente "${target?.name ?? ''}" removido.`);
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover cliente');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão consolidada de todos os ambientes</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 md:max-w-md">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{clients.length}</p>
          <p className="text-[11px] text-gray-400">Total</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-900">{envCount('sharks_company')}</p>
          <p className="text-[11px] text-blue-500">Sharks Company</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-emerald-900">{envCount('estrategos')}</p>
          <p className="text-[11px] text-emerald-600">Estrategos</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            description="Crie o primeiro workspace em qualquer ambiente para começar."
            action={<Button onClick={() => setWizardOpen(true)}>+ Novo cliente</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(c => {
            const env = clientEnv(c);
            const meta = ENVIRONMENT_META[env];
            return (
              <Card key={c.id} className="relative group">
                <div className="flex items-start gap-3">
                  <WorkspaceLogo name={c.name} logoUrl={c.logo_url} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                    </div>
                    <div className="mt-1">
                      <Badge variant={env === 'sharks_company' ? 'info' : 'success'} size="sm">
                        {meta.emoji} {meta.short}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{c.segment ?? 'Gestão'}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {c.city || 'Sem cidade'}, {c.state || '--'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Desde {formatDate(c.created_at)}</span>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditing({
                        id: c.id,
                        name: c.name,
                        segment: c.segment,
                        city: c.city,
                        state: c.state,
                        logo_url: c.logo_url,
                      })}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(c.id)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Wizard multi-ambiente (passo Ambiente no início) */}
      <ClientWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        environment={null}
        onCreated={() => { load(); }}
      />

      {/* Edit Client */}
      <ClientEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        client={editing}
        onSaved={() => { load(); }}
      />

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Excluir Cliente" size="sm">
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir <strong>{clients.find(c => c.id === deleteConfirm)?.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Esta ação irá desativar o cliente. Os dados não serão apagados permanentemente.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Excluir
          </Button>
        </div>
      </Modal>
    </div>
  );
}