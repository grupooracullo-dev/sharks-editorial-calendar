import { useState, useEffect, useCallback, useMemo } from 'react';
import { Action, CalendarViewType, EnvironmentType } from '@/types';
import { cn } from '@/lib/utils';
import { getCalendarDays, isSameMonth, isSameDay, formatCalendarDate, format, ptBR } from '@/lib/dateUtils';
import { isOverdue } from '@/lib/utils';
import { useActions } from '@/hooks/useActions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useIntegration } from '@/hooks/useIntegration';
import { isConnected, processQueue } from '@/lib/googleSync';
import CalendarEvent from '@/components/calendar/CalendarEvent';
import CalendarFilters from '@/components/calendar/CalendarFilters';
import WeekGeneratorModal from '@/components/calendar/WeekGeneratorModal';
import ActionDrawer from '@/components/actions/ActionDrawer';
import ActionForm from '@/components/actions/ActionForm';
import Button from '@/components/ui/Button';
import { useEditorial } from '@/hooks/useEditorial';
import { useStrategicDates } from '@/hooks/useStrategicDates';
import { useChannels } from '@/hooks/useChannels';
import { useActiveCampaigns } from '@/hooks/useCampaigns';
import { ACTION_STATUSES } from '@/lib/constants';
import { ChevronLeft, ChevronRight, Calendar, Plus, Wand2, RefreshCw } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { toast } from 'sonner';

interface SharksCalendarProps {
  initialView?: CalendarViewType;
  environment?: EnvironmentType;
}

export default function SharksCalendar({ initialView = 'month', environment }: SharksCalendarProps) {
  const { isMobile } = useBreakpoint();
  const { isAdmin } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType>(isMobile ? 'day' : initialView);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [draggedAction, setDraggedAction] = useState<Action | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const { currentWorkspace } = useWorkspace();
  const { integration } = useIntegration(currentWorkspace?.id);
  const [syncing, setSyncing] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const filterObj = useMemo(() => ({
    workspaceId: currentWorkspace?.id,
    format: (filters.format as Action['format'] | undefined) || undefined,
    status: (filters.status as Action['status'] | undefined) || undefined,
    objective: (filters.objective as Action['objective'] | undefined) || undefined,
    environment,
  }), [currentWorkspace?.id, filters.format, filters.status, filters.objective, environment]);

  const { actions, update, remove, create } = useActions(filterObj);
  const { pillars, profile } = useEditorial(currentWorkspace?.id);
  const activeCampaigns = useActiveCampaigns(currentWorkspace?.id);
  const { dates: strategicDates } = useStrategicDates(currentWorkspace?.id);
  const channels = useChannels(currentWorkspace?.id);

  const STATUS_DOT_COLORS: Record<string, string> = {
    draft: 'bg-gray-400',
    briefing: 'bg-blue-500',
    in_production: 'bg-yellow-500',
    sharks_review: 'bg-purple-500',
    scheduled: 'bg-indigo-500',
    published: 'bg-green-500',
    completed: 'bg-emerald-500',
    cancelled: 'bg-red-400',
    overdue: 'bg-orange-500',
  };

  const weekStep = isMobile ? 3 : 7;
  const goToToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (view === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (view === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekStep));
    else if (view === 'day') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goNext = () => {
    if (view === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (view === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + weekStep));
    else if (view === 'day') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const handleActionClick = (action: Action) => {
    setSelectedAction(action);
    setDrawerOpen(true);
  };

  const handleEdit = (action: Action) => {
    setEditingAction(action);
    setFormOpen(true);
    setDrawerOpen(false);
  };

  const handleCreate = () => {
    setEditingAction(null);
    setFormOpen(true);
  };

  const handleCreateAtDate = (dateStr: string) => {
    setEditingAction({ action_date: dateStr } as Action);
    setFormOpen(true);
  };

  const handleQuickStatus = async (action: Action, newStatus: Action['status']) => {
    const result = await update(action.id, { status: newStatus });
    if (result.ok) {
      toast.success(`Status alterado para "${ACTION_STATUSES[newStatus]?.label || newStatus}"`);
    } else {
      toast.error(result.error || 'Erro ao alterar status');
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await processQueue(currentWorkspace?.id ?? null);
      if (res.failed) {
        toast.warning(`${res.ok ?? 0} sincronizado(s), ${res.failed} falharam.`);
      } else if (res.processed) {
        toast.success(`${res.processed} ação(ões) sincronizada(s) com Google Calendar.`);
      } else {
        toast.success('Tudo sincronizado.');
      }
    } catch (e) {
      toast.error(`Erro ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDuplicate = async (action: Action) => {
    const { id, created_at, updated_at, campaign, editorial_pillar, responsible, workspace, ...payload } = action;
    const result = await create({
      ...payload,
      title: `${action.title} (cópia)`,
      status: 'draft',
      sync_status: 'not_synced',
    });
    if (result.ok) {
      toast.success('Ação duplicada como rascunho!');
    } else {
      toast.error(result.error || 'Erro ao duplicar ação');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const action = actions.find(a => a.id === event.active.id);
    if (action) setDraggedAction(action);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedAction(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const actionId = active.id as string;
    const newDate = over.id as string;

    update(actionId, { action_date: newDate }).then(result => {
      if (result.ok) {
        toast.success('Data atualizada');
      } else {
        toast.error(result.error || 'Erro ao mover ação');
      }
    });
  };

  // Reset expanded day when navigating months
  useEffect(() => {
    setExpandedDay(null);
  }, [currentDate.getMonth(), currentDate.getFullYear()]);

  const calendarDays = getCalendarDays(currentDate);
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: ptBR });

  const views: { id: CalendarViewType; label: string }[] = isMobile
    ? [
        { id: 'day', label: 'Dia' },
        { id: 'week', label: 'Sem' },
        { id: 'agenda', label: 'Agenda' },
      ]
    : [
        { id: 'month', label: 'Mês' },
        { id: 'week', label: 'Semana' },
        { id: 'agenda', label: 'Agenda' },
      ];

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-9.5rem)] lg:h-[calc(100dvh-6.5rem)]">
      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 capitalize">{monthLabel}</h1>
            <Button variant="ghost" size="sm" onClick={goToToday}>Hoje</Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {views.map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                    view === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={goPrev}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goNext}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={!currentWorkspace}
              onClick={() => setGeneratorOpen(true)}
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Gerar semana</span>
            </Button>

            {isConnected(currentWorkspace?.id) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
                <span className="hidden sm:inline">Sincronizar</span>
              </Button>
            )}

            <Button size="sm" onClick={handleCreate}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova ação</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <CalendarFilters activeFilters={filters} onFilterChange={setFilters} environment={environment} />

        {/* Month View */}
        {view === 'month' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-7 border-b border-gray-200 shrink-0">
              {(isMobile ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] : weekDays).map((day, i) => (
                <div key={i} className="px-1 sm:px-3 py-2 text-xs font-semibold text-gray-500 text-center border-r last:border-r-0">
                  {day}
                </div>
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
                  const start = c.start_date;
                  const end = c.end_date || c.start_date;
                  return dateStr >= start && dateStr <= end;
                });

                // Datas estratégicas deste dia
                const dayStrategic = strategicDates.filter(s => s.date === dateStr);

                return (
                  <div
                    key={i}
                    id={dateStr}
                    onClick={() => { if (dayActions.length === 0) handleCreateAtDate(dateStr); }}
                    style={dayCampaigns.length > 0 ? {
                      backgroundImage: `linear-gradient(${dayCampaigns[0].color || '#3B82F6'}0F, ${dayCampaigns[0].color || '#3B82F6'}0F)`,
                    } : undefined}
                    className={cn(
                      'min-h-0 overflow-hidden border-r border-b last:border-r-0 p-1 sm:p-1.5 transition-colors',
                      !isCurrentMonth && 'bg-gray-50/50',
                      isToday && 'bg-primary-50/30',
                      dayActions.length === 0 && 'cursor-pointer',
                      'calendar-cell hover:bg-gray-50/80'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'text-xs font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full',
                        isToday && 'bg-primary-500 text-white',
                        !isToday && isCurrentMonth && 'text-gray-900',
                        !isCurrentMonth && 'text-gray-300'
                      )}>
                        {day.getDate()}
                      </span>
                    </div>
                    {/* Datas estratégicas */}
                    {dayStrategic.length > 0 && (
                      <div className="flex flex-col gap-0.5 mb-1">
                        {dayStrategic.map(s => (
                          <div
                            key={s.id}
                            className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-50 border border-amber-200"
                            title={s.description || s.title}
                          >
                            <span className="text-[8px] text-amber-600 font-medium truncate">{s.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                    {(() => {
                        const maxVisible = isMobile ? 3 : 4;
                        const isExpanded = expandedDay === dateStr;
                        const hiddenCount = dayActions.length - maxVisible;
                        return (
                          <div className="space-y-0.5">
                            {/* Pills compactas (estado colapsado) */}
                            {!isExpanded && dayActions.slice(0, maxVisible).map(action => (
                              <div
                                key={action.id}
                                onClick={(e) => { e.stopPropagation(); handleActionClick(action); }}
                                className="flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                              >
                                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT_COLORS[action.status] || 'bg-gray-400')} />
                                <span className="text-[10px] font-medium truncate">{action.title}</span>
                              </div>
                            ))}
                            {/* Botão "Ver todas" */}
                            {!isExpanded && hiddenCount > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedDay(dateStr); }}
                                className="w-full text-[9px] sm:text-[10px] text-primary-600 font-medium hover:text-primary-700 py-0.5 transition-colors"
                              >
                                Ver todas ({hiddenCount}+)
                              </button>
                            )}
                            {/* Estado expandido: todas as ações com scroll */}
                            {isExpanded && (
                              <div className="max-h-32 overflow-y-auto space-y-0.5 border-t border-gray-100 pt-1">
                                {dayActions.map(action => (
                                  <div
                                    key={action.id}
                                    onClick={(e) => { e.stopPropagation(); handleActionClick(action); }}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                                  >
                                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT_COLORS[action.status] || 'bg-gray-400')} />
                                    <span className="text-[10px] font-medium truncate">{action.title}</span>
                                  </div>
                                ))}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedDay(null); }}
                                  className="w-full text-[9px] text-gray-400 hover:text-gray-600 py-0.5 transition-colors"
                                >
                                  Recolher
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}
            </div>

            {/* Legenda */}
            {(activeCampaigns.filter(c => c.start_date).length > 0 || strategicDates.length > 0) && (
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                {activeCampaigns.filter(c => c.start_date).map(c => (
                  <span key={c.id} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: c.color || '#3B82F6' }} />
                    {c.name}
                  </span>
                ))}
                {strategicDates.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-amber-600">
                    <span className="w-3 h-1.5 rounded-full bg-amber-400" />
                    Data estratégica
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Week View */}
        {view === 'week' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className={cn(
              'grid border-b border-gray-200 shrink-0',
              isMobile ? 'grid-cols-3' : 'grid-cols-7'
            )}>
              {(isMobile ? calendarDays.slice(0, 3) : calendarDays.slice(0, 7)).map((day, i) => (
                <div key={i} className="px-2 py-3 text-center border-r last:border-r-0">
                  <p className="text-xs text-gray-500">{isMobile ? format(day, 'EEE', { locale: ptBR }) : weekDays[i]}</p>
                  <p className={cn(
                    'text-lg font-semibold',
                    isSameDay(day, new Date()) ? 'text-primary-500' : 'text-gray-900'
                  )}>
                    {day.getDate()}
                  </p>
                </div>
              ))}
            </div>
            <div className={cn(
              'grid flex-1 min-h-0',
              isMobile ? 'grid-cols-3' : 'grid-cols-7'
            )}>
              {(isMobile ? calendarDays.slice(0, 3) : calendarDays.slice(0, 7)).map((day, i) => {
                const dateStr = formatCalendarDate(day);
                const dayActions = actions.filter(a => a.action_date === dateStr);
                const dayCampaigns = activeCampaigns.filter(c => {
                  if (!c.start_date) return false;
                  const start = c.start_date;
                  const end = c.end_date || c.start_date;
                  return dateStr >= start && dateStr <= end;
                });
                const dayStrategic = strategicDates.filter(s => s.date === dateStr);

                return (
                  <div
                    key={i}
                    id={dateStr}
                    onClick={() => { if (dayActions.length === 0) handleCreateAtDate(dateStr); }}
                    className={cn(
                      'border-r last:border-r-0 p-1.5 sm:p-2 space-y-1 sm:space-y-2 min-h-0 overflow-y-auto',
                      dayActions.length === 0 && 'cursor-pointer'
                    )}
                  >
                    {dayStrategic.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {dayStrategic.map(s => (
                          <div key={s.id} className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-50 border border-amber-200" title={s.description || s.title}>
                            <span className="text-[8px] text-amber-600 font-medium truncate">{s.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                      <CalendarEvent
                        key={action.id}
                        action={action}
                        onClick={() => handleActionClick(action)}
                        onQuickStatus={handleQuickStatus}
                        compact={isMobile}
                        showClient={isAdmin}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Day View (mobile-optimized) */}
        {view === 'day' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50 shrink-0">
              <p className="text-sm font-semibold text-gray-900 capitalize">
                {format(currentDate, 'EEEE, dd MMMM yyyy', { locale: ptBR })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {actions.filter(a => a.action_date === formatCalendarDate(currentDate)).length} ação(ões) neste dia
              </p>
            </div>
            <div className="divide-y divide-gray-100 flex-1 min-h-0 overflow-y-auto">
              {(() => {
                const dateStr = formatCalendarDate(currentDate);
                const dayActions = actions.filter(a => a.action_date === dateStr);
                if (dayActions.length === 0) {
                  return (
                    <div className="p-8 text-center cursor-pointer hover:bg-gray-50/80 transition-colors" onClick={() => handleCreateAtDate(dateStr)}>
                      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">Nenhuma ação</p>
                      <p className="text-xs text-gray-500 mt-1">Clique aqui para criar uma ação.</p>
                    </div>
                  );
                }
                return dayActions.map(action => (
                  <div key={action.id} className="p-3 hover:bg-gray-50/80 transition-colors">
                    <CalendarEvent
                      action={action}
                      onClick={() => handleActionClick(action)}
                      onQuickStatus={handleQuickStatus}
                      showClient={isAdmin}
                    />
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Agenda View */}
        {view === 'agenda' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 flex-1 min-h-0 overflow-y-auto">
            {calendarDays.filter(d => actions.some(a => a.action_date === formatCalendarDate(d))).length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-900">Nenhuma ação neste período</p>
                <p className="text-xs text-gray-500 mt-1">Crie uma nova ação ou gere uma semana automaticamente.</p>
              </div>
            ) : (
              calendarDays.map((day, i) => {
                const dateStr = formatCalendarDate(day);
                const dayActions = actions.filter(a => a.action_date === dateStr);
                if (dayActions.length === 0) return null;

                return (
                  <div key={i} className="p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2 capitalize">
                      {format(day, 'EEEE, dd MMM', { locale: ptBR })}
                    </p>
                    <div className="space-y-2 ml-4">
                      {dayActions.map(action => (
                        <CalendarEvent
                          key={action.id}
                          action={action}
                          onClick={() => handleActionClick(action)}
                          onQuickStatus={handleQuickStatus}
                          showClient={isAdmin}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <DragOverlay>
          {draggedAction ? (
            <CalendarEvent action={draggedAction} onClick={() => {}} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Action Drawer */}
      <ActionDrawer
        action={selectedAction ? actions.find(a => a.id === selectedAction.id) ?? selectedAction : null}
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedAction(null); }}
        onEdit={handleEdit}
        onDelete={remove}
        onDuplicate={handleDuplicate}
        onUpdate={(id, patch) => update(id, patch)}
      />

      {/* Action Form */}
      <ActionForm
        action={editingAction}
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingAction(null); }}
        environment={environment}
      />

      {/* Week Generator */}
      {currentWorkspace && (
        <WeekGeneratorModal
          isOpen={generatorOpen}
          onClose={() => setGeneratorOpen(false)}
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          profile={profile}
          pillars={pillars}
          existingActions={actions}
          strategicDates={strategicDates}
          activeCampaigns={activeCampaigns}
          channels={channels}
        />
      )}
    </div>
  );
}
