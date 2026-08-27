import { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions } from '@/hooks/useActions';
import { useActiveCampaigns } from '@/hooks/useCampaigns';
import { Action, CalendarViewType } from '@/types';
import CalendarEvent from '@/components/calendar/CalendarEvent';
import Drawer from '@/components/ui/Drawer';
import StatusBadge from '@/components/actions/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import { CONTENT_FORMATS, OBJECTIVES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { formatCalendarDate, getCalendarDays, isSameMonth, isSameDay, format, ptBR, addMonths, subMonths } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export default function ClientCalendar() {
  const { currentWorkspace } = useWorkspace();
  const { isMobile } = useBreakpoint();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>(isMobile ? 'agenda' : 'month');
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { actions } = useActions(currentWorkspace ? { workspaceId: currentWorkspace.id } : {});
  const activeCampaigns = useActiveCampaigns(currentWorkspace?.id);

  const calendarDays = getCalendarDays(currentDate);
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: ptBR });

  const goPrev = () => {
    if (view === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - (isMobile ? 3 : 7)));
    else setCurrentDate(d => subMonths(d, 1));
  };
  const goNext = () => {
    if (view === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + (isMobile ? 3 : 7)));
    else setCurrentDate(d => addMonths(d, 1));
  };

  const handleActionClick = (action: Action) => {
    setSelectedAction(action);
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-9.5rem)] lg:h-[calc(100dvh-6.5rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 capitalize">Meu Calendário — {monthLabel}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {(isMobile ? (['week', 'agenda'] as CalendarViewType[]) : (['month', 'week', 'agenda'] as CalendarViewType[])).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Agenda'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
            <Button variant="outline" size="icon" onClick={goNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Month view (read-only) */}
      {view === 'month' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-7 border-b border-gray-200 shrink-0">
            {weekDays.map(day => (
              <div key={day} className="px-2 py-2 text-xs font-semibold text-gray-500 text-center">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
            {calendarDays.map((day, i) => {
              const dateStr = formatCalendarDate(day);
              const dayActions = actions.filter(a => a.action_date === dateStr);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              // Campanhas ativas neste dia
              const dayCampaigns = activeCampaigns.filter(c => {
                if (!c.start_date) return false;
                return dateStr >= c.start_date && dateStr <= (c.end_date || c.start_date);
              });

              return (
                <div
                  key={i}
                  style={dayCampaigns.length > 0 ? {
                    backgroundImage: `linear-gradient(${dayCampaigns[0].color || '#3B82F6'}0F, ${dayCampaigns[0].color || '#3B82F6'}0F)`,
                  } : undefined}
                  className={cn(
                    'min-h-0 overflow-hidden border-r border-b last:border-r-0 p-1.5',
                    !isCurrentMonth && 'bg-gray-50/50',
                    isToday && 'bg-primary-50/30'
                  )}
                >
                  <span className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                    isToday && 'bg-primary-500 text-white',
                    !isToday && isCurrentMonth && 'text-gray-900',
                    !isCurrentMonth && 'text-gray-300'
                  )}>
                    {day.getDate()}
                  </span>
                  {/* Faixa de campanha: continua entre dias, com label no inicio */}
                  {dayCampaigns.length > 0 && (
                    <div className="flex flex-col gap-0.5 mb-1">
                      {dayCampaigns.slice(0, 2).map(c => {
                        const rangeEnd = c.end_date || c.start_date!;
                        const col = i % 7;
                        const isStart = dateStr === c.start_date || col === 0;
                        const isEnd = dateStr === rangeEnd || col === 6;
                        const showLabel = dateStr === c.start_date || (col === 0 && c.start_date! < dateStr);
                        const color = c.color || '#3B82F6';
                        return (
                          <div
                            key={c.id}
                            title={`${c.name}${c.start_date ? ` · ${c.start_date.split('-').reverse().join('/')} → ${rangeEnd.split('-').reverse().join('/')}` : ''}`}
                            className={cn(
                              'flex items-center overflow-hidden',
                              showLabel ? 'h-[14px] px-1' : 'h-1.5',
                              isStart && isEnd && 'rounded-full',
                              isStart && !isEnd && 'rounded-l-full',
                              !isStart && isEnd && 'rounded-r-full'
                            )}
                            style={{ backgroundColor: color }}
                          >
                            {showLabel && (
                              <span className="text-[8px] font-semibold text-white truncate">🏁 {c.name}</span>
                            )}
                          </div>
                        );
                      })}
                      {dayCampaigns.length > 2 && (
                        <p className="text-[8px] text-gray-400 leading-none">+{dayCampaigns.length - 2} campanhas</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    {dayActions.slice(0, 3).map(action => (
                      <CalendarEvent key={action.id} action={action} onClick={() => handleActionClick(action)} compact />
                    ))}
                    {dayActions.length > 3 && (
                      <p className="text-[10px] text-gray-400">+{dayActions.length - 3}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          {activeCampaigns.filter(c => c.start_date).length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              {activeCampaigns.filter(c => c.start_date).map(c => (
                <span key={c.id} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: c.color || '#3B82F6' }} />
                  🏁 {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week view (read-only) */}
      {view === 'week' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className={cn('grid flex-1 min-h-0', isMobile ? 'grid-cols-3' : 'grid-cols-7')}>
            {(isMobile ? calendarDays.slice(0, 3) : calendarDays.slice(0, 7)).map((day, i) => {
              const dateStr = formatCalendarDate(day);
              const dayActions = actions.filter(a => a.action_date === dateStr);
              const dayCampaigns = activeCampaigns.filter(c => {
                if (!c.start_date) return false;
                return dateStr >= c.start_date && dateStr <= (c.end_date || c.start_date);
              });

              return (
                <div key={i} className="border-r last:border-r-0 p-2 min-h-0 flex flex-col">
                  <div className="text-center py-2 border-b border-gray-100 mb-2 shrink-0">
                    <p className="text-xs text-gray-500">{isMobile ? format(day, 'EEE', { locale: ptBR }) : weekDays[i]}</p>
                    <p className={cn('font-semibold', isSameDay(day, new Date()) ? 'text-primary-600' : 'text-gray-900')}>
                      {day.getDate()}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {dayCampaigns.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {dayCampaigns.map(c => (
                          <div
                            key={c.id}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                            style={{ backgroundColor: `${c.color || '#3B82F6'}1F` }}
                            title={`${c.name}${c.start_date ? ` · ${c.start_date.split('-').reverse().join('/')} → ${(c.end_date || c.start_date).split('-').reverse().join('/')}` : ''}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || '#3B82F6' }} />
                            <span className="text-[9px] font-semibold truncate" style={{ color: c.color || '#3B82F6' }}>
                              🏁 {c.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {dayActions.map(action => (
                      <CalendarEvent key={action.id} action={action} onClick={() => handleActionClick(action)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agenda view (read-only) */}
      {view === 'agenda' && (
        <Card padding="none" className="flex-1 min-h-0 overflow-y-auto">
          {(() => {
            const daysWithActions = calendarDays.filter(d => actions.some(a => a.action_date === formatCalendarDate(d)));
            if (daysWithActions.length === 0) {
              return (
                <EmptyState icon={CalendarIcon} title="Nenhuma ação programada" description="Seu calendário está em branco neste período." />
              );
            }
            return daysWithActions.map((day, i) => {
              const dateStr = formatCalendarDate(day);
              const dayActions = actions.filter(a => a.action_date === dateStr);
              if (dayActions.length === 0) return null;
              return (
                <div key={i} className="p-4 border-b last:border-b-0 border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 capitalize mb-2">
                    {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <div className="space-y-2 ml-2">
                    {dayActions.map(action => (
                      <CalendarEvent key={action.id} action={action} onClick={() => handleActionClick(action)} />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </Card>
      )}

      {/* Action detail drawer (client-friendly, read-only) */}
      <Drawer isOpen={drawerOpen} onClose={() => { setDrawerOpen(false); setSelectedAction(null); }} title="Detalhes da Ação" width="md">
        {selectedAction && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{selectedAction.title}</h3>
              <StatusBadge status={selectedAction.status} />
            </div>

            {selectedAction.description && (
              <p className="text-sm text-gray-500">{selectedAction.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Data</p>
                <p className="text-sm text-gray-900">
                  {new Date(selectedAction.action_date + 'T00:00:00').toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </p>
              </div>
              {selectedAction.action_time && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Horário</p>
                  <p className="text-sm text-gray-900">{selectedAction.action_time.slice(0, 5)}</p>
                </div>
              )}
              {selectedAction.format && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Formato</p>
                  <Badge variant="primary">{CONTENT_FORMATS[selectedAction.format]}</Badge>
                </div>
              )}
              {selectedAction.channel && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Canal</p>
                  <p className="text-sm text-gray-900">{selectedAction.channel}</p>
                </div>
              )}
              {selectedAction.responsible && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Responsável</p>
                  <p className="text-sm text-gray-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold">
                      {selectedAction.responsible.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                    {selectedAction.responsible.full_name}
                  </p>
                </div>
              )}
              {selectedAction.objective && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Objetivo</p>
                  <p className="text-sm text-gray-900">{OBJECTIVES[selectedAction.objective]}</p>
                </div>
              )}
            </div>

            {selectedAction.copy_text && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Copy</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 whitespace-pre-wrap">
                  {selectedAction.copy_text}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 bg-blue-50 p-3 rounded-lg">
              💡 Dúvidas ou sugestões sobre esta ação? Use o Chat para conversar com a equipe Sharks!
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
