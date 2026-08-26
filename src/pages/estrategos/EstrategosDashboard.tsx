import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActions, useOverdueActions } from '@/hooks/useActions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import StatsCard from '@/components/dashboard/StatsCard';
import AlertCard from '@/components/dashboard/AlertCard';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import StatusBadge from '@/components/actions/StatusBadge';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDate, cn } from '@/lib/utils';
import { formatCalendarDate, startOfWeek, endOfWeek, parseISO, format, ptBR } from '@/lib/dateUtils';
import {
  Briefcase,
  CalendarDays,
  Clock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export default function EstrategosDashboard() {
  const navigate = useNavigate();
  const { workspacesByEnv } = useWorkspace();
  const workspaces = workspacesByEnv('estrategos');

  const allActions = useActions({});
  const overdue = useOverdueActions();

  const today = new Date();
  const todayStr = formatCalendarDate(today);
  const weekStart = formatCalendarDate(startOfWeek(today, { weekStartsOn: 0 }));
  const weekEnd = formatCalendarDate(endOfWeek(today, { weekStartsOn: 0 }));

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estrategos — Visão Geral</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDate(today)} — Gestão empresarial: projetos, reuniões e implantações
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard icon={Briefcase} label="Clientes ativos" value={stats.activeClients} onClick={() => navigate('/estrategos/clients')} />
        <StatsCard icon={CalendarDays} label="Ações esta semana" value={stats.actionsThisWeek} />
        <StatsCard icon={Clock} label="Programadas" value={stats.scheduled} />
        <StatsCard icon={AlertTriangle} label="Atrasadas" value={stats.overdue} iconBg="bg-red-50 text-red-600" />
        <StatsCard icon={CalendarDays} label="Pendências" value={stats.pending} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Calendário</CardTitle>
            <span className="text-xs text-gray-400">clique em um dia</span>
          </CardHeader>
          <MiniCalendar
            actions={allActions.actions}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedDayLabel}</CardTitle>
            <button
              onClick={() => navigate('/estrategos/calendar')}
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
                onClick={() => navigate('/estrategos/calendar')}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                + Nova ação
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
              {stats.selectedDayActions.map(action => (
                <div key={action.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                    <p className="text-xs text-gray-500">
                      {action.action_time?.slice(0, 5) || '—'} · {workspaces.find(w => w.id === action.workspace_id)?.name}
                    </p>
                  </div>
                  <StatusBadge status={action.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {overdue.slice(0, 3).map(action => (
              <AlertCard
                key={action.id}
                type="danger"
                title="Ação atrasada"
                message={action.title}
                onClick={() => navigate('/estrategos/calendar')}
              />
            ))}
            {stats.pending > 0 && (
              <AlertCard
                type="warning"
                title={`${stats.pending} pendências`}
                message="Ações aguardando aprovação ou revisão"
                onClick={() => navigate('/estrategos/calendar')}
              />
            )}
            {overdue.length === 0 && stats.pending === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Tudo em dia!</p>
            )}
          </div>
        </Card>
      </div>

      {stats.next7Days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próximos 7 dias</CardTitle>
            <button
              onClick={() => navigate('/estrategos/calendar')}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver calendário <ArrowRight className="w-3 h-3" />
            </button>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.next7Days.map(action => (
              <div key={action.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {format(parseISO(action.action_date + 'T00:00:00'), 'dd/MM', { locale: ptBR })}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                  <p className="text-xs text-gray-500">{action.action_time?.slice(0, 5) || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
