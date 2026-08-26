import { useEffect, useState, useCallback } from 'react';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import { supabase } from '@/lib/supabase';
import { ENVIRONMENT_META, type User, type EnvironmentType, type EnvironmentRole } from '@/types';
import { toast } from 'sonner';
import { ShieldCheck, Plus, X, Loader2, Search } from 'lucide-react';

interface Row {
  user_id: string;
  environment: EnvironmentType;
  role: EnvironmentRole;
  created_at: string;
  users?: { email: string; full_name: string; role: string } | null;
}

const ROLE_LABEL: Record<EnvironmentRole, string> = {
  admin: 'Admin',
  team: 'Time',
  client: 'Cliente',
};

export default function OraculloAccess() {
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ user_id: '', environment: 'sharks_company', role: 'client' });

  const load = useCallback(async () => {
    const [a, u] = await Promise.all([
      supabase.from('user_environments').select('user_id, environment, role, created_at, users(email, full_name, role)'),
      supabase.from('users').select('*').order('full_name'),
    ]);
    setRows((a.data as unknown as Row[]) ?? []);
    setUsers((u.data as unknown as User[]) ?? []);
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_environments')
        .upsert(
          { user_id: form.user_id, environment: form.environment as EnvironmentType, role: form.role as EnvironmentRole },
          { onConflict: 'user_id,environment' },
        );
      if (error) throw error;
      toast.success('Acesso concedido.');
      setModal(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (row: Row) => {
    const label = `${row.users?.full_name ?? row.user_id} — ${ENVIRONMENT_META[row.environment].label}`;
    if (!window.confirm(`Revogar o acesso a ${label}? O usuário perde o acesso ao ambiente imediatamente.`)) return;
    try {
      const { error } = await supabase
        .from('user_environments')
        .delete()
        .eq('user_id', row.user_id)
        .eq('environment', row.environment);
      if (error) throw error;
      toast.success('Acesso revogado.');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acessos por Ambiente</h1>
          <p className="text-sm text-gray-500 mt-0.5">O Oracullo decide quem acessa Sharks Company e Estrategos</p>
        </div>
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" /> Conceder acesso</Button>
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
            {entries.map(({ user, envs }) => (
              <div key={user.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={user.full_name} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
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
            ))}
          </div>
        )}
      </Card>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Conceder acesso">
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <p>O usuário ganha acesso imediato ao ambiente escolhido. Revogar remove o acesso na hora (RLS reage em tempo real).</p>
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
              onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleGrant} loading={saving}>Conceder</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
