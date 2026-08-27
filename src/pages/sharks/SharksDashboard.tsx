import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions, useOverdueActions } from '@/hooks/useActions';
import StatsCard from '@/components/dashboard/StatsCard';
import AlertCard from '@/components/dashboard/AlertCard';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import MonthSummaryCard from '@/components/dashboard/MonthSummaryCard';
import StatusBadge from '@/components/actions/StatusBadge';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import WorkspaceLogo from '@/components/ui/WorkspaceLogo';
import { formatDate, formatTime, cn } from '@/lib/utils';
import { formatCalendarDate, startOfWeek, endOfWeek, parseISO, format, ptBR } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { type Campaign, type StrategicDate } from '@/types';
import {
  Users,
  CalendarDays,
  FileText,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export default function SharksDashboard() {
  const navigate = useNavigate();
  const { workspacesByEnv } = useWorkspace();
  const workspaces = workspacesByEnv('sharks_company');

  const allActions = useActions({});
  const overdue = useOverdueActions();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [strategicDates, setStrategicDates] = useState<StrategicDate[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('campaigns').select('*'),
      supabase.from('strategic_dates').select('*'),
    ]).then(([cp, sd]) => {
      setCampaigns((cp.data as unknown as Campaign[]) ?? []);
      setStrategicDates((sd.data as unknown as StrategicDate[]) ?? []);
    });
  }, []);

  const today = new Date();
  const todayStr = formatCalendarDate(today);
  const weekStart = formatCalendarDate(startOfWeek(today, { weekStartsOn: 0 }));
  const weekEnd = formatCalendarDate(endOfWeek(today, { weekStartsOn: 0 }));

  // Dia selecionado no mini calendario (padrao: hoje)
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isSelectedToday = selectedDate === todayStr;

  const stats = useMemo(() => {
    const actionsThisWeek = allActions.actions.filter(a => a.action_date >= weekStart && a.action_date <= weekEnd);
    const scheduled = allActions.actions.filter(a => a.status === 'scheduled');
    const pending = allActions.actions.filter(a => ['draft', 'briefing'].includes(a.status));

    return {
      activeClients: workspaces.length,
      actionsThisWeek: actionsThisWeek.length,
      scheduled: scheduled.length,
      pending: pending.length,
      overdue: overdue.length,
      todayActions: allActions.actions.filter(a => a.action_date === todayStr),
      selectedDayActions: allActions.actions
        .filter(a => a.action_date === selectedDate && a.status !== 'cancelled')
        .sort((a, b) => (a.action_time || '').localeCompare(b.action_time || '')),
      next7Days: allActions.actions
        .filter(a => a.action_date > todayStr && a.action_date <= formatCalendarDate(new Date(Date.now() + 7 * 86400000)))
        .slice(0, 8),
    };
  }, [allActions.actions, overdue.length, workspaces.length, todayStr, selectedDate, weekStart, weekEnd]);

  const selectedDayLabel = useMemo(() => {
    if (isSelectedToday) return 'Hoje';
    const d = parseISO(selectedDate + 'T00:00:00');
    const raw = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate, isSelectedToday]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Visão Geral</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDate(today)} — Acompanhe tudo que está acontecendo
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard icon={Users} label="Clientes ativos" value={stats.activeClients} onClick={() => navigate('/sharks/clients')} />
        <StatsCard icon={CalendarDays} label="Ações esta semana" value={stats.actionsThisWeek} />
        <StatsCard icon={FileText} label="Conteúdos programados" value={stats.scheduled} />
        <StatsCard icon={Clock} label="Pendências" value={stats.pending} />
        <StatsCard icon={AlertTriangle} label="Atrasadas" value={stats.overdue} iconBg="bg-red-50 text-red-600" />
      </div>

      {/* ALERTAS — quick insight acima do calendário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            ALERTAS
          </CardTitle>
          <button
            onClick={() => navigate('/sharks/calendar')}
            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            Resolver <ArrowRight className="w-3 h-3" />
          </button>
        </CardHeader>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {overdue.slice(0, 2).map(action => (
            <AlertCard
              key={action.id}
              type="danger"
              title="Ação atrasada"
              message={action.title}
              onClick={() => navigate('/sharks/calendar')}
            />
          ))}
          {stats.pending > 0 && (
            <AlertCard
              type="warning"
              title={`${stats.pending} pendências`}
              message="Ações aguardando produção"
              onClick={() => navigate('/sharks/calendar')}
            />
          )}
          {overdue.length === 0 && stats.pending === 0 && (
            <AlertCard type="success" title="Tudo em ordem!" message="Nenhum alerta ativo no momento." />
          )}
        </div>
      </Card>

      {/* ESTE MÊS — acima do calendário */}
      <MonthSummaryCard actions={allActions.actions} />

      {/* CALENDARIO - largura total da secao */}
      <Card className="border-t-4 border-t-primary-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </span>
            CALENDÁRIO
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
              {stats.todayActions.length} ação{stats.todayActions.length !== 1 ? 'ões' : ''} hoje
            </span>
            <button
              onClick={() => navigate('/sharks/calendar')}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver calendário completo <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </CardHeader>
        <MiniCalendar
          actions={allActions.actions}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          campaigns={campaigns}
          strategicDates={strategicDates}
          onOpenCalendar={() => navigate('/sharks/calendar')}
        />
      </Card>

      {/* VISÃO DO DIA — largura total */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>VISÃO DO DIA</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">{selectedDayLabel}</p>
          </div>
          <button
            onClick={() => navigate('/sharks/calendar')}
            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            Ver calendário <ArrowRight className="w-3 h-3" />
          </button>
        </CardHeader>
        {stats.selectedDayActions.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {isSelectedToday ? 'Nenhuma ação para hoje' : 'Nenhuma ação neste dia'}
            </p>
            <button
              onClick={() => navigate('/sharks/calendar')}
              className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              + Nova ação
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {stats.selectedDayActions.map(action => (
              <div key={action.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-bold text-gray-900 w-14 shrink-0">
                  {action.action_time?.slice(0, 5) || '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {workspaces.find(w => w.id === action.workspace_id)?.name}
                    {action.responsible?.full_name && ` · ${action.responsible.full_name}`}
                  </p>
                </div>
                <StatusBadge status={action.status} size="sm" className="shrink-0" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PRÓXIMOS 7 DIAS */}
      <Card>
        <CardHeader>
          <CardTitle>Próximos 7 dias</CardTitle>
          <span className="text-xs text-gray-400">{stats.next7Days.length} ações</span>
        </CardHeader>
        {stats.next7Days.length === 0 ? (
          <div className="py-8 text-center">
            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhuma ação agendada para os próximos dias</p>
            <button
              onClick={() => navigate('/sharks/calendar')}
              className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Gerar semana automaticamente
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.next7Days.map(action => {
              const ws = workspaces.find(w => w.id === action.workspace_id);
              return (
                <div key={action.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(action.action_date)}
                      {ws && ` · ${ws.name}`}
                    </p>
                  </div>
                  <StatusBadge status={action.status} size="sm" />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CLIENTES */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Clientes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => {
            const wsActions = allActions.actions.filter(a => a.workspace_id === ws.id);
            const wsPending = wsActions.filter(a => ['draft', 'briefing'].includes(a.status)).length;
            const published = wsActions.filter(a => ['published', 'completed'].includes(a.status)).length;
            const progress = wsActions.length > 0 ? Math.round((published / wsActions.length) * 100) : 0;

            return (
              <Card key={ws.id} hover padding="md" onClick={() => navigate('/sharks/calendar')}>
                <div className="flex items-start justify-between mb-3">
                  <WorkspaceLogo name={ws.name} logoUrl={ws.logo_url} size="md" />
                  <StatusBadge status={ws.is_active ? 'scheduled' : 'cancelled'} size="sm" />
                </div>
                <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                <p className="text-xs text-gray-500 mb-3">{ws.segment}</p>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>{wsActions.length} ações totais</span>
                  <span>{progress}% concluído</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
