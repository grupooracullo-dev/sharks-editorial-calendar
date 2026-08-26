import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import { supabase } from '@/lib/supabase';
import { ENVIRONMENT_META, type User, type EnvironmentType, type EnvironmentRole } from '@/types';
import { toast } from 'sonner';
import { ShieldCheck, Plus, X, Loader2, Search, Building2 } from 'lucide-react';

interface Row {
  user_id: string;
  environment: EnvironmentType;
  role: EnvironmentRole;
  created_at: string;
  users?: { email: string; full_name: string; role: string } | null;
}

interface WsWithEnv {
  id: string;
  name: string;
  environment: string;
}

const ROLE_LABEL: Record<EnvironmentRole, string> = {
  admin: 'Admin',
  team: 'Time',
  client: 'Cliente',
};

export default function OraculloAccess() {
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [memberships, setMemberships] = useState<Array<{ user_id: string; workspace_id: string }>>([]);
  const [workspaces, setWorkspaces] = useState<WsWithEnv[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    user_id: '',
    environment: 'sharks_company',
    role: 'client',
    wsMode: 'new' as 'existing' | 'new',
    workspace_id: '',
    new_workspace_name: '',
  });

  const load = useCallback(async () => {
    const [a, u, m, ws, envMapRes] = await Promise.all([
      supabase.from('user_environments').select('user_id, environment, role, created_at, users(email, full_name, role)'),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('memberships').select('user_id, workspace_id'),
      supabase.from('workspaces').select('id, name').eq('is_active', true).order('name'),
      supabase.rpc('ws_env_map'),
    ]);
    const envMap = new Map<string, string>(
      ((envMapRes.data ?? []) as Array<{ id: string; environment: string }>).map(r => [r.id, r.environment]),
    );
    setRows((a.data as unknown as Row[]) ?? []);
    setUsers((u.data as unknown as User[]) ?? []);
    setMemberships((m.data as Array<{ user_id: string; workspace_id: string }>) ?? []);
    setWorkspaces(
      ((ws.data ?? []) as Array<{ id: string; name: string }>).map(w => ({
        ...w,
        environment: envMap.get(w.id) ?? 'sharks_company',
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('oracullo-access')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_environments' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleGrant = async () => {
    if (!form.user_id) {
      toast.error('Selecione um usuário');
      return;
    }
    if (form.role === 'client') {
      if (form.wsMode === 'existing' && !form.workspace_id) {
        toast.error('Selecione a empresa (workspace) do cliente');
        return;
      }
      if (form.wsMode === 'new' && !form.new_workspace_name.trim()) {
        toast.error('Informe o nome da nova empresa');
        return;
      }
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-link-user-env', {
        body: {
          op: 'link',
          user_id: form.user_id,
          environment: form.environment,
          env_role: form.role,
          ...(form.role === 'client' && form.wsMode === 'existing' ? { workspace_id: form.workspace_id } : {}),
          ...(form.role === 'client' && form.wsMode === 'new' ? { new_workspace_name: form.new_workspace_name.trim() } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success(
        data.workspace_created
          ? `Acesso concedido e empresa "${form.new_workspace_name.trim()}" criada em ${ENVIRONMENT_META[form.environment as EnvironmentType].label}.`
          : 'Acesso concedido e vinculado à empresa.',
      );
      setModal(false);
      setForm(f => ({ ...f, workspace_id: '', new_workspace_name: '' }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (row: Row) => {
    const label = `${row.users?.full_name ?? row.user_id} — ${ENVIRONMENT_META[row.environment].label}`;
    if (!window.confirm(
      `Revogar o acesso a ${label}?\n\nO usuário perde o acesso ao ambiente E os vínculos com as empresas daquele ambiente (sem resíduo).`,
    )) return;
    try {
      const { data, error } = await supabase.functions.invoke('admin-link-user-env', {
        body: { op: 'unlink', user_id: row.user_id, environment: row.environment },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Acesso revogado${data.removed_memberships > 0 ? ` (${data.removed_memberships} vínculo(s) removido(s))` : ''}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Agrupa por usuário para a matriz visual
  const byUser = new Map<string, { user: User; envs: Partial<Record<EnvironmentType, EnvironmentRole>> }>();
  for (const row of rows) {
    const user = users.find(u => u.id === row.user_id);
    if (!user) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user, envs: {} });
    byUser.get(row.user_id)!.envs[row.environment] = row.role;
  }
  const entries = [...byUser.values()].filter(e =>
    !search || e.user.full_name.toLowerCase().includes(search.toLowerCase()) || e.user.email.toLowerCase().includes(search.toLowerCase())
  );

  const userCompanies = (userId: string): string[] => {
    const wsIds = new Set(memberships.filter(m => m.user_id === userId).map(m => m.workspace_id));
    return workspaces.filter(w => wsIds.has(w.id)).map(w => w.name);
  };

  const envWorkspaces = workspaces.filter(w => w.environment === form.environment);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acessos por Ambiente</h1>
          <p className="text-sm text-gray-500 mt-0.5">O Oracullo decide quem acessa Sharks Company e Estrategos</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" /> Vincular acesso</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar usuário..."
          className="pl-9"
        />
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500 py-12 text-center">Nenhum acesso concedido ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map(({ user, envs }) => {
              const companies = userCompanies(user.id);
              return (
                <div key={user.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={user.full_name} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      {companies.length > 0 && (
                        <p className="text-[11px] text-gray-400 truncate flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 shrink-0" />
                          {companies.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(['sharks_company', 'estrategos'] as EnvironmentType[]).map(env => {
                      const role = envs[env];
                      return role ? (
                        <button
                          key={env}
                          onClick={() => handleRevoke({ user_id: user.id, environment: env, role, created_at: '', users: { email: user.email, full_name: user.full_name, role: user.role } })}
                          className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors"
                          title={`Revogar acesso ${ENVIRONMENT_META[env].label}`}
                        >
                          <span className="text-sm leading-none">{ENVIRONMENT_META[env].emoji}</span>
                          <span className="text-xs font-medium text-gray-700 group-hover:text-red-700">{ROLE_LABEL[role]}</span>
                          <X className="w-3 h-3 text-gray-300 group-hover:text-red-500" />
                        </button>
                      ) : (
                        <span key={env} className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-200 text-xs text-gray-300">
                          {ENVIRONMENT_META[env].emoji} sem acesso
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Vincular acesso a ambiente">
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Acesso concedido + vínculo à empresa do ambiente em uma operação atômica.
              Clientes só veem empresas às quais foram vinculados.
            </p>
          </div>
          <Select
            label="Usuário"
            value={form.user_id}
            onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
            placeholder="Selecione"
            options={users.map(u => ({ value: u.id, label: `${u.full_name} (${u.email})` }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Ambiente"
              value={form.environment}
              onChange={e => setForm(f => ({ ...f, environment: e.target.value, workspace_id: '', new_workspace_name: '' }))}
              options={[
                { value: 'sharks_company', label: '🦈 Sharks Company' },
                { value: 'estrategos', label: '📊 Estrategos' },
              ]}
            />
            <Select
              label="Papel"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              options={Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>

          {form.role === 'client' && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-gray-400" />
                Empresa do cliente em {ENVIRONMENT_META[form.environment as EnvironmentType].label}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, wsMode: 'existing' }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    form.wsMode === 'existing'
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  Empresa existente
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, wsMode: 'new' }))}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    form.wsMode === 'new'
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Plus className="w-3 h-3" /> Criar nova empresa
                </button>
              </div>
              {form.wsMode === 'existing' ? (
                <Select
                  value={form.workspace_id}
                  onChange={e => setForm(f => ({ ...f, workspace_id: e.target.value }))}
                  placeholder="Selecione a empresa..."
                  options={envWorkspaces.map(w => ({ value: w.id, label: w.name }))}
                />
              ) : (
                <Input
                  value={form.new_workspace_name}
                  onChange={e => setForm(f => ({ ...f, new_workspace_name: e.target.value }))}
                  placeholder="Nome da empresa (ex: PB & RN Foods)"
                />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleGrant} loading={saving}>Vincular</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
