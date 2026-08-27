import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import StatusBadge from '@/components/actions/StatusBadge';
import ActionDrawer from '@/components/actions/ActionDrawer';
import { supabase } from '@/lib/supabase';
import { type User, type EnvironmentType, type Action, type Campaign, type StrategicDate } from '@/types';
import { formatCalendarDate, parseISO, format, ptBR } from '@/lib/dateUtils';
import { formatDate, cn } from '@/lib/utils';
import { Users, Building2, Briefcase, Link2, CalendarDays } from 'lucide-react';

export default function OraculloDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [wsCount, setWsCount] = useState<{ sharks: number; estrategos: number }>({ sharks: 0, estrategos: 0 });
  const [actions, setActions] = useState<Action[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [strategicDates, setStrategicDates] = useState<StrategicDate[]>([]);
  const [detailAction, setDetailAction] = useState<Action | null>(null);
  const today = new Date();
  const todayStr = formatCalendarDate(today);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  useEffect(() => {
    const load = async () => {
      const [u, w, ac, cp, sd] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role'),
        supabase.from('workspaces').select('id, organizations(environment)').eq('is_active', true),
        supabase.from('actions').select('*, workspace:workspaces(name)').order('action_date'),
        supabase.from('campaigns').select('*'),
        supabase.from('strategic_dates').select('*'),
      ]);
      setUsers((u.data as unknown as User[]) ?? []);
      const wsRows = (w.data ?? []) as unknown as Array<{ organizations: { environment: EnvironmentType } | null }>;
      setWsCount({
        sharks: wsRows.filter(r => r.organizations?.environment === 'sharks_company').length,
        estrategos: wsRows.filter(r => r.organizations?.environment === 'estrategos').length,
      });
      setActions((ac.data as unknown as Action[]) ?? []);
      setCampaigns((cp.data as unknown as Campaign[]) ?? []);
      setStrategicDates((sd.data as unknown as StrategicDate[]) ?? []);
    };
    load();

    const channel = supabase
      .channel('oracullo-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
            campaigns={campaigns}
            strategicDates={strategicDates}
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
                    onClick={() => setDetailAction(action)}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {action.action_time?.slice(0, 5) || '—'} · {envLabel(env)}
                        {action.workspace?.name ? ` · ${action.workspace.name}` : ''}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-xl leading-none">🌐</span>
                Ambientes
              </CardTitle>
              <span className="text-xs text-gray-400">visao consolidada</span>
            </CardHeader>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{wsCount.sharks + wsCount.estrategos}</p>
                <p className="text-[11px] text-gray-400">Clientes total</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{users.length}</p>
                <p className="text-[11px] text-gray-400">Usuarios</p>
              </div>
            </div>
            <div className="space-y-2">
              {users.slice(0, 5).map(u => (
                <div key={u.id} className="flex items-center gap-2.5">
                  <Avatar name={u.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{u.full_name}</p>
                  </div>
                  <Badge variant={u.role === 'oracullo_admin' ? 'purple' : 'default'} size="sm">
                    {u.role === 'oracullo_admin' ? 'Oracullo' : u.role === 'admin_sharks' ? 'Admin Sharks' : u.role === 'sharks_team' ? 'Time Sharks' : 'Cliente'}
                  </Badge>
                </div>
              ))}
              {users.length > 5 && (
                <p className="text-xs text-gray-400 text-center pt-1">+{users.length - 5} outros</p>
              )}
            </div>
            <button
              onClick={() => navigate('/oracullo/access')}
              className="mt-4 w-full text-center text-sm text-primary-600 hover:text-primary-700 transition-colors"
            >
              Ver todos os acessos →
            </button>
          </Card>
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

      {/* Detalhes da ação (clique na ação do dia) */}
      <ActionDrawer
        action={detailAction}
        isOpen={!!detailAction}
        onClose={() => setDetailAction(null)}
        onEdit={a => {
          setDetailAction(null);
          navigate(a.environment === 'estrategos' ? '/estrategos/calendar' : '/sharks/calendar');
        }}
      />
    </div>
  );
}
