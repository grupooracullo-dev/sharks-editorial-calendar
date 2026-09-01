import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import WorkspaceLogo from '@/components/ui/WorkspaceLogo';
import Badge from '@/components/ui/Badge';
import ClientWizard from '@/components/clients/ClientWizard';
import ClientEditModal, { type ClientEditTarget } from '@/components/clients/ClientEditModal';
import { fetchAllClients, deactivateClient, type ClientWithOrg } from '@/lib/clientFactory';
import { ENVIRONMENT_META, type EnvironmentType } from '@/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Building2, MapPin, Loader2, Pencil, Trash2, ArrowRightLeft, UserPlus, ShieldCheck } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const ENVS: EnvironmentType[] = ['sharks_company', 'estrategos'];

interface ClientUserRef {
  id: string;
  full_name: string;
  email: string;
}

async function functionErrorMessage(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const body = await (error as { context: Response }).context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch { /* */ }
  }
  return error instanceof Error ? error.message : 'Erro inesperado';
}

export default function OraculloClients() {
  const [clients, setClients] = useState<ClientWithOrg[]>([]);
  const [clientUsers, setClientUsers] = useState<Record<string, ClientUserRef | null>>({});
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<ClientEditTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Mover ambiente
  const [moveTarget, setMoveTarget] = useState<ClientWithOrg | null>(null);
  const [moveTo, setMoveTo] = useState<EnvironmentType>('estrategos');
  const [moving, setMoving] = useState(false);

  // Criar acesso do cliente
  const [accessTarget, setAccessTarget] = useState<ClientWithOrg | null>(null);
  const [accessForm, setAccessForm] = useState({ full_name: '', email: '', password: '' });
  const [creatingAccess, setCreatingAccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, memsRes, cuRes] = await Promise.all([
        fetchAllClients(),
        supabase.from('memberships').select('workspace_id, user_id').eq('role', 'member'),
        supabase.from('users').select('id, full_name, email').eq('role', 'client'),
      ]);
      setClients(list);
      const cuById = new Map(
        ((cuRes.data ?? []) as Array<{ id: string; full_name: string; email: string }>).map(u => [u.id, u]),
      );
      const map: Record<string, ClientUserRef | null> = {};
      for (const c of list) map[c.id] = null;
      for (const m of ((memsRes.data ?? []) as Array<{ workspace_id: string; user_id: string }>)) {
        const cu = cuById.get(m.user_id);
        if (cu && !map[m.workspace_id]) {
          map[m.workspace_id] = { id: cu.id, full_name: cu.full_name, email: cu.email };
        }
      }
      setClientUsers(map);
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

  const openMove = (c: ClientWithOrg) => {
    setMoveTarget(c);
    setMoveTo(clientEnv(c) === 'sharks_company' ? 'estrategos' : 'sharks_company');
  };

  const handleMove = async () => {
    if (!moveTarget || moving) return;
    setMoving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-move-client-env', {
        body: { workspace_id: moveTarget.id, target_environment: moveTo },
      });
      if (error) throw new Error(await functionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      const cnt = data?.counts ?? {};
      toast.success(
        `"${data?.name ?? moveTarget.name}" movido para ${ENVIRONMENT_META[moveTo as EnvironmentType].label} — ${cnt.actions ?? 0} ações, ${cnt.campaigns ?? 0} campanhas, ${cnt.strategic_dates ?? 0} datas preservadas.`,
      );
      setMoveTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao mover cliente');
    } finally {
      setMoving(false);
    }
  };

  const openCreateAccess = (c: ClientWithOrg) => {
    setAccessTarget(c);
    setAccessForm({ full_name: c.name, email: '', password: '' });
  };

  const handleCreateAccess = async () => {
    if (!accessTarget || creatingAccess) return;
    if (!accessForm.email.trim() || !accessForm.password || !accessForm.full_name.trim()) {
      toast.error('Preencha nome, e-mail e senha');
      return;
    }
    setCreatingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: accessForm.email.trim(),
          password: accessForm.password,
          full_name: accessForm.full_name.trim(),
          role: 'client',
          environment: clientEnv(accessTarget),
          workspace_id: accessTarget.id,
        },
      });
      if (error) throw new Error(await functionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      toast.success(data?.linked
        ? `"${accessForm.full_name.trim()}" já tinha conta e foi vinculado à empresa ${accessTarget.name}.`
        : `Acesso do cliente "${accessTarget.name}" criado!${data?.email_sent ? ' E-mail de boas-vindas enviado.' : ' (e-mail não enviado — informe a senha ao cliente)'}`);
      setAccessTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar acesso');
    } finally {
      setCreatingAccess(false);
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
                    {!clientUsers[c.id] && (
                      <button
                        onClick={() => openCreateAccess(c)}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-colors"
                        title="Criar acesso do cliente (usuário + vínculo à empresa)"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => openMove(c)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition-colors"
                      title="Mover para outro ambiente"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
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

      {/* Mover ambiente */}
      <Modal isOpen={!!moveTarget} onClose={() => setMoveTarget(null)} title="Mover cliente de ambiente" size="sm">
        {moveTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <WorkspaceLogo name={moveTarget.name} logoUrl={moveTarget.logo_url} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{moveTarget.name}</p>
                <p className="text-xs text-gray-500">
                  Atual: {ENVIRONMENT_META[clientEnv(moveTarget)].emoji} {ENVIRONMENT_META[clientEnv(moveTarget)].label}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mover para</label>
              <div className="grid grid-cols-2 gap-2">
                {ENVS.map(env => {
                  const meta = ENVIRONMENT_META[env];
                  const active = moveTo === env;
                  const isCurrent = clientEnv(moveTarget) === env;
                  return (
                    <button
                      key={env}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setMoveTo(env)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        active && !isCurrent
                          ? 'border-primary-500 bg-primary-50'
                          : isCurrent
                            ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl leading-none">{meta.emoji}</span>
                      <span className={`text-xs font-medium ${active && !isCurrent ? 'text-primary-700' : 'text-gray-700'}`}>{meta.short}</span>
                      {isCurrent && <span className="text-[10px] text-gray-400">atual</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-start gap-2 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                A empresa passa a pertencer ao ambiente selecionado. Ações, campanhas, datas e chat são preservados.
                Movimentação válida apenas para guardião Oracullo.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setMoveTarget(null)}>Cancelar</Button>
              <Button onClick={handleMove} loading={moving}>
                <ArrowRightLeft className="w-4 h-4" />
                Mover
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Criar acesso do cliente */}
      <Modal isOpen={!!accessTarget} onClose={() => setAccessTarget(null)} title="Criar acesso do cliente" size="sm">
        {accessTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
              <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{accessTarget.name}</p>
                <p className="text-xs text-gray-500">
                  {ENVIRONMENT_META[clientEnv(accessTarget)].emoji} {ENVIRONMENT_META[clientEnv(accessTarget)].label} · usuário com papel Cliente
                </p>
              </div>
            </div>
            <Input
              label="Nome completo"
              value={accessForm.full_name}
              onChange={(e) => setAccessForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Ex: Contato DILATI"
            />
            <Input
              label="E-mail do cliente"
              type="email"
              value={accessForm.email}
              onChange={(e) => setAccessForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@empresa.com"
            />
            <Input
              label="Senha"
              type="password"
              value={accessForm.password}
              onChange={(e) => setAccessForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 6 caracteres"
            />
            <p className="text-[11px] text-gray-400">
              O cliente receberá e-mail de boas-vindas com as credenciais (se o envio estiver configurado).
              Se o e-mail já existir no sistema, o usuário é vinculado à empresa em vez de recriado.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAccessTarget(null)}>Cancelar</Button>
              <Button onClick={handleCreateAccess} loading={creatingAccess} disabled={!accessForm.full_name.trim() || !accessForm.email.trim() || !accessForm.password}>
                <UserPlus className="w-4 h-4" />
                Criar acesso
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}