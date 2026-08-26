import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import StatusBadge from '@/components/actions/StatusBadge';
import { supabase } from '@/lib/supabase';
import { ENVIRONMENT_META, type User, type EnvironmentType, type Action } from '@/types';
import { formatCalendarDate, parseISO, format, ptBR } from '@/lib/dateUtils';
import { formatDate, cn } from '@/lib/utils';
import { Users, Building2, Briefcase, Link2, ArrowRight, CalendarDays, Clock } from 'lucide-react';

interface EnvAccess {
  user_id: string;
  environment: EnvironmentType;
}

export default function OraculloDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [access, setAccess] = useState<EnvAccess[]>([]);
  const [wsCount, setWsCount] = useState<{ sharks: number; estrategos: number }>({ sharks: 0, estrategos: 0 });
  const [actions, setActions] = useState<Action[]>([]);
  const today = new Date();
  const todayStr = formatCalendarDate(today);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  useEffect(() => {
    const load = async () => {
      const [u, a, w, ac] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role'),
        supabase.from('user_environments').select('user_id, environment'),
        supabase.from('workspaces').select('id, organizations(environment)'),
        supabase.from('actions').select('*, workspace:workspaces(name)').order('action_date'),
      ]);
      setUsers((u.data as unknown as User[]) ?? []);
      setAccess((a.data as unknown as EnvAccess[]) ?? []);
      const wsRows = (w.data ?? []) as unknown as Array<{ organizations: { environment: EnvironmentType } | null }>;
      setWsCount({
        sharks: wsRows.filter(r => r.organizations?.environment === 'sharks_company').length,
        estrategos: wsRows.filter(r => r.organizations?.environment === 'estrategos').length,
      });
      setActions((ac.data as unknown as Action[]) ?? []);
    };
    load();

    const channel = supabase
      .channel('oracullo-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const envUsers = (env: EnvironmentType) => {
    const ids = new Set(access.filter(a => a.environment === env).map(a => a.user_id));
    return users.filter(u => ids.has(u.id) || u.role === 'oracullo_admin');
  };

  const selectedDayActions = useMemo(() =>
    actions
      .filter(a => a.action_date === selectedDate && a.status !== 'cancelled')
      .sort((a, b) => (a.action_time || '').localeCompare(b.action_time || '')),
    [actions, selectedDate]
  );

  const isSelectedToday = selectedDate === todayStr;

  const selectedDayLabel = useMemo(() => {
    if (isSelectedToday) return 'Hoje';
    const d = parseISO(selectedDate + 'T00:00:00');
    const raw = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate, isSelectedToday]);

  const envLabel = (env: EnvironmentType) => env === 'sharks_company' ? 'Sharks' : 'Estrategos';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Oracullo Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDate(today)} — Governança dos ambientes
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium">Usuários</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium">Workspaces</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{wsCount.sharks + wsCount.estrategos}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium">Ações total</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium">Projetos Estrategos</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{actions.filter(a => a.environment === 'estrategos').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Calendário</CardTitle>
            <span className="text-xs text-gray-400">todos os ambientes</span>
          </CardHeader>
          <MiniCalendar
            actions={actions}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedDayLabel}</CardTitle>
          </CardHeader>
          {selectedDayActions.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {isSelectedToday ? 'Nenhuma ação para hoje' : 'Nenhuma ação neste dia'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
              {selectedDayActions.map(action => {
                const env = action.environment || 'sharks_company';
                return (
                  <div
                    key={action.id}
                    onClick={() => navigate(env === 'sharks_company' ? '/sharks/calendar' : '/estrategos/calendar')}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                      <p className="text-xs text-gray-500">
                        {action.action_time?.slice(0, 5) || '—'} · {envLabel(env)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={env === 'sharks_company' ? 'info' : 'success'} size="sm">
                        {envLabel(env)}
                      </Badge>
                      <StatusBadge status={action.status} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {(['sharks_company', 'estrategos'] as EnvironmentType[]).map(env => {
            const meta = ENVIRONMENT_META[env];
            const list = envUsers(env);
            return (
              <Card key={env} hover onClick={() => navigate(env === 'sharks_company' ? '/sharks' : '/estrategos')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-xl leading-none">{meta.emoji}</span>
                    {meta.label}
                  </CardTitle>
                  <span className="flex items-center gap-1 text-xs text-primary-600">
                    Entrar <ArrowRight className="w-3 h-3" />
                  </span>
                </CardHeader>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{env === 'sharks_company' ? wsCount.sharks : wsCount.estrategos}</p>
                    <p className="text-[11px] text-gray-400">Clientes</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{list.length}</p>
                    <p className="text-[11px] text-gray-400">Com acesso</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {list.slice(0, 3).map(u => (
                    <div key={u.id} className="flex items-center gap-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{u.full_name}</p>
                      </div>
                      <Badge variant={u.role === 'oracullo_admin' ? 'purple' : 'default'} size="sm">
                        {u.role === 'oracullo_admin' ? 'Oracullo' : u.role === 'admin_sharks' ? 'Admin' : u.role === 'sharks_team' ? 'Time' : 'Cliente'}
                      </Badge>
                    </div>
                  ))}
                  {list.length > 3 && (
                    <p className="text-xs text-gray-400 text-center pt-1">+{list.length - 3} outros</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4 text-gray-400" /> Ações rápidas</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/oracullo/access')} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
            Gerenciar acessos
          </button>
          <button onClick={() => navigate('/oracullo/users')} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
            Ver usuários
          </button>
          <button onClick={() => navigate('/oracullo/access-requests')} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
            Solicitações pendentes
          </button>
        </div>
      </Card>
    </div>
  );
}
