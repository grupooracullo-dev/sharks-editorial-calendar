import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions } from '@/hooks/useActions';
import { useCampaigns } from '@/hooks/useCampaigns';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import StatusBadge from '@/components/actions/StatusBadge';
import MiniCalendar from '@/components/dashboard/MiniCalendar';
import MonthSummaryCard from '@/components/dashboard/MonthSummaryCard';
import { CONTENT_FORMATS, ACTION_TYPES } from '@/lib/constants';
import { formatDate, formatTime, cn } from '@/lib/utils';
import { formatCalendarDate, parseISO, format, ptBR } from '@/lib/dateUtils';
import { CalendarDays, Sparkles, Megaphone, ArrowRight } from 'lucide-react';

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { actions } = useActions(currentWorkspace ? { workspaceId: currentWorkspace.id } : {});
  const { campaigns } = useCampaigns(currentWorkspace?.id);

  const today = new Date();
  const todayStr = formatCalendarDate(today);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isSelectedToday = selectedDate === todayStr;

  const data = useMemo(() => {
    const upcoming = actions.filter(a => a.action_date >= todayStr && a.status !== 'cancelled').slice(0, 5);
    const nextAction = upcoming[0];
    const activeCampaign = campaigns.find(c => c.status === 'active');
    const todayActions = actions.filter(a => a.action_date === todayStr && a.status !== 'cancelled');
    const selectedDayActions = actions
      .filter(a => a.action_date === selectedDate && a.status !== 'cancelled')
      .sort((a, b) => (a.action_time || '').localeCompare(b.action_time || ''));

    return { upcoming, nextAction, activeCampaign, todayActions, selectedDayActions };
  }, [actions, campaigns, todayStr, selectedDate]);

  const selectedDayLabel = useMemo(() => {
    if (isSelectedToday) return 'Hoje';
    const d = parseISO(selectedDate + 'T00:00:00');
    const raw = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate, isSelectedToday]);

  if (!currentWorkspace) return null;

  // Quick insights derivados
  const nextActionDate = data.nextAction ? new Date(data.nextAction.action_date + 'T00:00:00') : new Date();
  const nextActionRelative = (() => {
    if (!data.nextAction) return '';
    const days = Math.round((nextActionDate.getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000);
    return days <= 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`;
  })();
  const nextActionChip = data.nextAction
    ? data.nextAction.format && data.nextAction.format !== 'other'
      ? CONTENT_FORMATS[data.nextAction.format]
      : data.nextAction.action_type && data.nextAction.action_type !== 'other'
        ? ACTION_TYPES[data.nextAction.action_type]
        : null
    : null;
  const campaignDaysLeft = data.activeCampaign?.end_date
    ? Math.ceil(
        (new Date(data.activeCampaign.end_date + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) /
          86400000
      )
    : null;
  const campaignProgress = (() => {
    const c = data.activeCampaign;
    if (!c?.start_date || !c.end_date) return null;
    const start = new Date(c.start_date + 'T00:00:00').getTime();
    const end = new Date(c.end_date + 'T00:00:00').getTime();
    if (end <= start) return null;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  })();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {currentWorkspace.name}!</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aqui está o resumo do seu planejamento</p>
      </div>

      {/* QUICK INSIGHTS — acima do calendário */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próxima publicação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary-500" />
              PRÓXIMA PUBLICAÇÃO
            </CardTitle>
            {data.nextAction && (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary-50 text-primary-700 uppercase tracking-wide">
                {nextActionRelative}
              </span>
            )}
          </CardHeader>
          {data.nextAction ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white flex flex-col items-center justify-center shrink-0 shadow-sm">
                <span className="text-[10px] uppercase font-medium opacity-80 leading-none">
                  {nextActionDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                </span>
                <span className="text-2xl font-bold leading-tight">{nextActionDate.getDate()}</span>
                <span className="text-[10px] capitalize opacity-80 leading-none">
                  {format(nextActionDate, 'MMM', { locale: ptBR })}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{data.nextAction.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {nextActionChip && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px] font-medium text-gray-600">
                      {nextActionChip}
                    </span>
                  )}
                  {data.nextAction.action_time && (
                    <span className="text-xs text-gray-400">{formatTime(data.nextAction.action_time)}</span>
                  )}
                </div>
                <StatusBadge status={data.nextAction.status} size="sm" className="mt-2 inline-flex" />
              </div>
            </div>
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
            {data.activeCampaign && campaignDaysLeft !== null && (
              <span
                className={cn(
                  'text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide',
                  campaignDaysLeft >= 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400'
                )}
              >
                {campaignDaysLeft >= 0 ? `${campaignDaysLeft}d restantes` : 'Encerrada'}
              </span>
            )}
          </CardHeader>
          {data.activeCampaign ? (
            <>
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: data.activeCampaign.color || '#3B82F6' }}
                />
                <p className="font-semibold text-gray-900 truncate">{data.activeCampaign.name}</p>
              </div>
              {data.activeCampaign.objective && (
                <p className="text-sm text-gray-500 mt-1 truncate">{data.activeCampaign.objective}</p>
              )}
              {campaignProgress !== null && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>{formatDate(data.activeCampaign.start_date!)}</span>
                    <span>{data.activeCampaign.end_date ? formatDate(data.activeCampaign.end_date) : '—'}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${campaignProgress}%`, backgroundColor: data.activeCampaign.color || '#3B82F6' }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma campanha ativa no momento</p>
          )}
        </Card>
      </div>

      {/* ESTE MÊS — acima do calendário */}
      <MonthSummaryCard actions={actions} />

      {/* CALENDARIO - principal, largura total da secao */}
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
              {data.todayActions.length} ação{data.todayActions.length !== 1 ? 'ões' : ''} hoje
            </span>
            <button
              onClick={() => navigate('/client/calendar')}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver agenda completa <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </CardHeader>
        <MiniCalendar
          actions={actions}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          campaigns={campaigns}
          onOpenCalendar={() => navigate('/client/calendar')}
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {data.selectedDayActions.map(action => (
              <div key={action.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-bold text-gray-900 w-14 shrink-0">
                  {action.action_time?.slice(0, 5) || '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {CONTENT_FORMATS[action.format || 'other']}
                    {action.campaign?.name && ` · ${action.campaign.name}`}
                  </p>
                </div>
                <StatusBadge status={action.status} size="sm" className="shrink-0" />
              </div>
            ))}
          </div>
        )}
      </Card>

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