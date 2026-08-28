import { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import WorkspaceLogo from '@/components/ui/WorkspaceLogo';
import ClientWizard from '@/components/clients/ClientWizard';
import ClientEditModal, { type ClientEditTarget } from '@/components/clients/ClientEditModal';
import { deactivateClient } from '@/lib/clientFactory';
import { toast } from 'sonner';
import { Plus, Building2, MapPin, ChevronRight, Pencil, Trash2 } from 'lucide-react';

export default function SharksClients() {
  const { workspacesByEnv, setCurrentWorkspace, refreshWorkspaces } = useWorkspace();
  const workspaces = workspacesByEnv('sharks_company');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<ClientEditTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (wsId: string, wsName: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deactivateClient(wsId);
      await refreshWorkspaces();
      toast.success(`Cliente "${wsName}" removido.`);
      setDeleteConfirm(null);
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
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os workspaces de cada cliente</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4" />
          Novo cliente
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhum cliente cadastrado"
            description="Crie seu primeiro workspace para começar a planejar."
            action={<Button onClick={() => setWizardOpen(true)}>+ Novo cliente</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <Card key={ws.id} className="relative group">
              <div
                className="flex items-start gap-3 cursor-pointer"
                onClick={() => { setCurrentWorkspace(ws); window.location.hash = '#/sharks/calendar'; }}
              >
                <WorkspaceLogo name={ws.name} logoUrl={ws.logo_url} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{ws.name}</h3>
                  <p className="text-xs text-gray-500">{ws.segment}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" />
                    {ws.city}, {ws.state}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({
                      id: ws.id,
                      name: ws.name,
                      segment: ws.segment,
                      city: ws.city,
                      state: ws.state,
                      logo_url: ws.logo_url,
                    });
                  }}
                  className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ws.id); }}
                  className="p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Onboarding Wizard completo (linha editorial, frequência, datas e Google Calendar) */}
      <ClientWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        environment="sharks_company"
        onCreated={() => { refreshWorkspaces(); }}
      />

      {/* Edit Client */}
      <ClientEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        client={editing}
        onSaved={() => { refreshWorkspaces(); }}
      />

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Excluir Cliente" size="sm">
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir <strong>{workspaces.find(w => w.id === deleteConfirm)?.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Esta ação irá desativar o cliente. Os dados não serão apagados permanentemente.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              const ws = workspaces.find(w => w.id === deleteConfirm);
              if (ws) handleDelete(ws.id, ws.name);
            }}
            loading={deleting}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </div>
  );
}