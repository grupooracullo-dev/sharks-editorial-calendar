import { useEffect, useState, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ENVIRONMENT_META, type User, type EnvironmentType, type EnvironmentRole } from '@/types';
import { toast } from 'sonner';
import { ShieldCheck, Plus, X, Loader2, Search, Building2, History, UserPlus, UserMinus, UserCog } from 'lucide-react';

interface Row {
  user_id: string;
  environment: EnvironmentType;
  role: EnvironmentRole;
  created_at: string;
  users?: { email: string; full_name: string; role: string } | null;
}

interface HistoryRow {
  id: string;
  user_id: string;
  environment: EnvironmentType;
  env_role: EnvironmentRole | null;
  action: 'granted' | 'revoked' | 'role_changed';
  workspace_id: string | null;
  workspace_name: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
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
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
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
    const [a, h, u, m, ws, envMapRes] = await Promise.all([
      supabase.from('user_environments').select('user_id, environment, role, created_at, users(email, full_name, role)'),
      supabase.from('access_histories').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('memberships').select('user_id, workspace_id'),
      supabase.from('workspaces').select('id, name').eq('is_active', true).order('name'),
      supabase.rpc('ws_env_map'),
    ]);
    const envMap = new Map<string, string>(
      ((envMapRes.data ?? []) as Array<{ id: string; environment: string }>).map(r => [r.id, r.environment]),
    );
    setRows((a.data as unknown as Row[]) ?? []);
    setHistory((h.data as unknown as HistoryRow[]) ?? []);
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
    supabase.auth.getUser().then(({ data }) => setMeId(data?.user?.id ?? null));
    const channel = supabase
      .channel('oracullo-access')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_environments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_histories' }, load)
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

      // Registra no histórico (granted / role_changed)
      const previous = rows.find(r => r.user_id === form.user_id && r.environment === form.environment);
      const histAction: HistoryRow['action'] = previous
        ? (previous.role === form.role ? 'granted' : 'role_changed')
        : 'granted';
      const wsName = form.role === 'client'
        ? (form.wsMode === 'existing'
            ? workspaces.find(w => w.id === form.workspace_id)?.name ?? null
            : form.new_workspace_name.trim() || null)
        : null;
      await supabase.from('access_histories').insert({
        user_id: form.user_id,
        environment: form.environment,
        env_role: form.role,
        action: histAction,
        workspace_id: form.role === 'client' && form.wsMode === 'existing' ? form.workspace_id || null : null,
        workspace_name: wsName,
        performed_by: meId,
        performed_by_name: users.find(u => u.id === meId)?.full_name ?? null,
      });

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

      // Registra no histórico (revoked) com as empresas daquele ambiente
      const envCompanies = workspaces
        .filter(w => w.environment === row.environment)
        .filter(w => memberships.some(m => m.user_id === row.user_id && m.workspace_id === w.id))
        .map(w => w.name);
      await supabase.from('access_histories').insert({
        user_id: row.user_id,
        environment: row.environment,
        env_role: row.role,
        action: 'revoked',
        workspace_name: envCompanies.length > 0 ? envCompanies.join(' · ') : null,
        performed_by: meId,
        performed_by_name: users.find(u => u.id === meId)?.full_name ?? null,
      });

      toast.success(
        `Acesso revogado${data.removed_memberships > 0 ? ` (${data.removed_memberships} vínculo(s) removido(s))` : ''}.`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

// Agrupa por usuário para a matriz visual
const byUser = new Map<string, { user: User; envs: Partial<Record<EnvironmentType, { role: EnvironmentRole; created_at: string }>> }>();
for (const row of rows) {
  const user = users.find(u => u.id === row.user_id);
  if (!user) continue;
  if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user, envs: {} });
  byUser.get(row.user_id)!.envs[row.environment] = { role: row.role, created_at: row.created_at };
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
                    <Avatar name={user.full_name} src={user.avatar_url} size="md" />
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
                      const access = envs[env];
                      const sinceLabel = access?.created_at
                        ? ` (desde ${new Date(access.created_at).toLocaleDateString('pt-BR')})`
                        : '';
                      return access ? (
                        <button
                          key={env}
                          onClick={() => handleRevoke({ user_id: user.id, environment: env, role: access.role, created_at: access.created_at, users: { email: user.email, full_name: user.full_name, role: user.role } })}
                          className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors"
                          title={`Revogar acesso ${ENVIRONMENT_META[env].label}${sinceLabel}`}
                        >
                          <span className="text-sm leading-none">{ENVIRONMENT_META[env].emoji}</span>
                          <span className="text-xs font-medium text-gray-700 group-hover:text-red-700">{ROLE_LABEL[access.role]}</span>
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

      {/* Histórico de acessos */}
      <Card padding="none">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-b border-gray-100">
          <History className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Histórico de acessos</h2>
          <span className="text-[11px] text-gray-400">({history.length} evento{history.length === 1 ? '' : 's'})</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-primary-500 animate-spin" /></div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 py-10 text-center">
            Nenhum evento registrado ainda. Concessões e revogações aparecerão aqui.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {history.map(h => {
              const user = users.find(u => u.id === h.user_id);
              const envMeta = ENVIRONMENT_META[h.environment];
              const isRevoke = h.action === 'revoked';
              const isChange = h.action === 'role_changed';
              const Icon = isRevoke ? UserMinus : isChange ? UserCog : UserPlus;
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                  <span className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                    isRevoke ? 'bg-red-50 text-red-500' : isChange ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">
                      <span className="font-medium text-gray-900">{user?.full_name ?? h.user_id}</span>
                      {' '}
                      {isRevoke ? 'perdeu acesso a' : isChange ? 'teve o papel alterado em' : 'recebeu acesso a'}
                      {' '}{envMeta.emoji} {envMeta.label}
                      {h.env_role && !isRevoke ? ` (${ROLE_LABEL[h.env_role]})` : ''}
                      {h.workspace_name ? ` — ${h.workspace_name}` : ''}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {h.performed_by_name ? ` · por ${h.performed_by_name}` : ''}
                    </p>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ambiente</label>
            <div className="grid grid-cols-2 gap-3">
              {(['sharks_company', 'estrategos'] as EnvironmentType[]).map(env => {
                const meta = ENVIRONMENT_META[env];
                const active = form.environment === env;
                return (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, environment: env, workspace_id: '', new_workspace_name: '' }))}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      active
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl leading-none">{meta.emoji}</span>
                    <div>
                      <p className={`text-sm font-semibold ${active ? 'text-primary-700' : 'text-gray-900'}`}>{meta.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {env === 'sharks_company' ? 'Marketing editorial' : 'Gestão de projetos'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Papel</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ROLE_LABEL).map(([value, label]) => {
                const active = form.role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, role: value }))}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      active
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
