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

  const goToToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (view === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (view === 'week') setCurrentDate(d => new Date(d.getTime() - 7 * 86400000));
    else if (view === 'day') setCurrentDate(d => new Date(d.getTime() - 86400000));
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goNext = () => {
    if (view === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (view === 'week') setCurrentDate(d => new Date(d.getTime() + 7 * 86400000));
    else if (view === 'day') setCurrentDate(d => new Date(d.getTime() + 86400000));
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
    <div className="space-y-4">
      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
        <CalendarFilters activeFilters={filters} onFilterChange={setFilters} />

        {/* Month View */}
        {view === 'month' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {(isMobile ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] : weekDays).map((day, i) => (
                <div key={i} className="px-1 sm:px-3 py-2 text-xs font-semibold text-gray-500 text-center border-r last:border-r-0">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const dateStr = formatCalendarDate(day);
                const dayActions = actions.filter(a => a.action_date === dateStr);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={i}
                    id={dateStr}
                    className={cn(
                      'min-h-[70px] sm:min-h-[100px] md:min-h-[120px] border-r border-b last:border-r-0 p-1 sm:p-1.5 transition-colors',
                      !isCurrentMonth && 'bg-gray-50/50',
                      isToday && 'bg-primary-50/30',
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
                    <div className="space-y-0.5 sm:space-y-1">
                      {dayActions.slice(0, isMobile ? 2 : 3).map(action => (
                        <CalendarEvent
                          key={action.id}
                          action={action}
                          onClick={() => handleActionClick(action)}
                          compact
                          showClient={isAdmin}
                        />
                      ))}
                      {dayActions.length > (isMobile ? 2 : 3) && (
                        <p className="text-[9px] sm:text-[10px] text-gray-400 text-center">+{dayActions.length - (isMobile ? 2 : 3)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week View */}
        {view === 'week' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={cn(
              'grid border-b border-gray-200',
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
              'grid min-h-[400px] sm:min-h-[500px]',
              isMobile ? 'grid-cols-3' : 'grid-cols-7'
            )}>
              {(isMobile ? calendarDays.slice(0, 3) : calendarDays.slice(0, 7)).map((day, i) => {
                const dateStr = formatCalendarDate(day);
                const dayActions = actions.filter(a => a.action_date === dateStr);

                return (
                  <div key={i} id={dateStr} className="border-r last:border-r-0 p-1.5 sm:p-2 space-y-1 sm:space-y-2">
                    {dayActions.map(action => (
                      <CalendarEvent
                        key={action.id}
                        action={action}
                        onClick={() => handleActionClick(action)}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
              <p className="text-sm font-semibold text-gray-900 capitalize">
                {format(currentDate, 'EEEE, dd MMMM yyyy', { locale: ptBR })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {actions.filter(a => a.action_date === formatCalendarDate(currentDate)).length} ação(ões) neste dia
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {(() => {
                const dateStr = formatCalendarDate(currentDate);
                const dayActions = actions.filter(a => a.action_date === dateStr);
                if (dayActions.length === 0) {
                  return (
                    <div className="p-8 text-center">
                      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">Nenhuma ação</p>
                      <p className="text-xs text-gray-500 mt-1">Toque em "+" para criar uma ação.</p>
                    </div>
                  );
                }
                return dayActions.map(action => (
                  <div key={action.id} className="p-3 hover:bg-gray-50/80 transition-colors">
                    <CalendarEvent
                      action={action}
                      onClick={() => handleActionClick(action)}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
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
        action={selectedAction}
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedAction(null); }}
        onEdit={handleEdit}
        onDelete={remove}
        onDuplicate={handleDuplicate}
      />

      {/* Action Form */}
      <ActionForm
        action={editingAction}
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingAction(null); }}
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
