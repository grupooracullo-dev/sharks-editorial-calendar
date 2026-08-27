import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions } from '@/hooks/useActions';
import { useCampaigns } from '@/hooks/useCampaigns';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import StatusBadge from '@/components/actions/StatusBadge';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import { CONTENT_FORMATS } from '@/lib/constants';
import { formatDate, formatTime, cn } from '@/lib/utils';
import { formatCalendarDate, startOfWeek, endOfWeek, parseISO, format, ptBR } from '@/lib/dateUtils';
import { CalendarDays, Sparkles, Megaphone, ArrowRight } from 'lucide-react';

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { actions } = useActions(currentWorkspace ? { workspaceId: currentWorkspace.id } : {});
  const { campaigns } = useCampaigns(currentWorkspace?.id);

  const today = new Date();
  const todayStr = formatCalendarDate(today);
  const weekStart = formatCalendarDate(startOfWeek(today, { weekStartsOn: 0 }));
  const weekEnd = formatCalendarDate(endOfWeek(today, { weekStartsOn: 0 }));

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isSelectedToday = selectedDate === todayStr;

  const data = useMemo(() => {
    const weekActions = actions.filter(a => a.action_date >= weekStart && a.action_date <= weekEnd);
    const upcoming = actions.filter(a => a.action_date >= todayStr && a.status !== 'cancelled').slice(0, 5);
    const nextAction = upcoming[0];
    const activeCampaign = campaigns.find(c => c.status === 'active');
    const selectedDayActions = actions
      .filter(a => a.action_date === selectedDate && a.status !== 'cancelled')
      .sort((a, b) => (a.action_time || '').localeCompare(b.action_time || ''));

    return { weekActions, upcoming, nextAction, activeCampaign, selectedDayActions };
  }, [actions, campaigns, todayStr, selectedDate, weekStart, weekEnd]);

  const selectedDayLabel = useMemo(() => {
    if (isSelectedToday) return 'Hoje';
    const d = parseISO(selectedDate + 'T00:00:00');
    const raw = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate, isSelectedToday]);

  if (!currentWorkspace) return null;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {currentWorkspace.name}!</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aqui está o resumo do seu planejamento</p>
      </div>

      {/* CALENDARIO - largura total da secao */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-500" />
            CALENDÁRIO
          </CardTitle>
          <button
            onClick={() => navigate('/client/calendar')}
            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            Ver agenda completa <ArrowRight className="w-3 h-3" />
          </button>
        </CardHeader>
        <MiniCalendar actions={actions} selectedDate={selectedDate} onSelectDate={setSelectedDate} campaigns={campaigns} />
      </Card>

      {/* CARDS ABAIXO DO CALENDARIO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Dia selecionado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{selectedDayLabel.toUpperCase()}</CardTitle>
            <button
              onClick={() => navigate('/client/calendar')}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver agenda <ArrowRight className="w-3 h-3" />
            </button>
          </CardHeader>
          {data.selectedDayActions.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {isSelectedToday ? 'Nenhuma ação para hoje' : 'Nenhuma ação neste dia'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[19rem] overflow-y-auto pr-1">
              {data.selectedDayActions.map(action => (
                <div key={action.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                    <p className="text-xs text-gray-500">
                      {action.action_time?.slice(0, 5) || '—'} · {CONTENT_FORMATS[action.format || 'other']}
                    </p>
                  </div>
                  <StatusBadge status={action.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Esta semana */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary-500" />
              ESTA SEMANA
            </CardTitle>
          </CardHeader>
          <p className="text-3xl font-bold text-gray-900">{data.weekActions.length}</p>
          <p className="text-sm text-gray-500 mt-1">ações programadas</p>

          <div className="flex flex-wrap gap-1.5 mt-4">
            {Object.entries(
              data.weekActions.reduce((acc, a) => {
                if (a.format) acc[a.format] = (acc[a.format] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([format, count]) => (
              <span key={format} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                {count}× {CONTENT_FORMATS[format as keyof typeof CONTENT_FORMATS]}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próxima publicação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary-500" />
              PRÓXIMA PUBLICAÇÃO
            </CardTitle>
          </CardHeader>
          {data.nextAction ? (
            <>
              <p className="font-semibold text-gray-900">{CONTENT_FORMATS[data.nextAction.format || 'other']}</p>
              <p className="text-sm text-gray-700 mt-1">{data.nextAction.title}</p>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(data.nextAction.action_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                {' · '}
                {formatTime(data.nextAction.action_time)}
              </p>
              <StatusBadge status={data.nextAction.status} size="sm" className="mt-3 inline-flex" />
            </>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma publicação agendada</p>
          )}
        </Card>

        {/* Campanha ativa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone className="w-4 h-4 text-primary-500" />
              CAMPANHA ATIVA
            </CardTitle>
          </CardHeader>
          {data.activeCampaign ? (
            <>
              <p className="font-semibold text-gray-900">{data.activeCampaign.name}</p>
              {data.activeCampaign.objective && (
                <p className="text-sm text-gray-500 mt-1">{data.activeCampaign.objective}</p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Até {data.activeCampaign.end_date ? formatDate(data.activeCampaign.end_date) : '—'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma campanha ativa no momento</p>
          )}
        </Card>
      </div>

      {/* Próximas ações */}
      <Card>
        <CardHeader>
          <CardTitle>Próximas ações</CardTitle>
        </CardHeader>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">Nenhuma ação futura programada</p>
        ) : (
          <div className="space-y-2">
            {data.upcoming.map(action => {
              const date = new Date(action.action_date + 'T00:00:00');
              const isToday = action.action_date === todayStr;
              return (
                <div key={action.id} className={cn('flex items-center gap-4 p-3 rounded-lg', isToday ? 'bg-primary-50 border border-primary-100' : 'bg-gray-50')}>
                  <div className="text-center flex-shrink-0 w-12">
                    <p className="text-[10px] uppercase text-gray-400">
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </p>
                    <p className={cn('text-lg font-bold leading-tight', isToday ? 'text-primary-600' : 'text-gray-900')}>
                      {date.getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                    <p className="text-xs text-gray-500">
                      {CONTENT_FORMATS[action.format || 'other']}
                      {action.action_time && ` · ${formatTime(action.action_time)}`}
                      {isToday && ' · Hoje!'}
                    </p>
                  </div>
                  <StatusBadge status={action.status} size="sm" />
                  <ArrowRight className="w-4 h-4 text-gray-300 hidden sm:block" />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
