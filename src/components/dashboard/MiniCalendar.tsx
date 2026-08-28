import { useEffect, useMemo, useRef, useState } from 'react';
import { Action, Campaign, StrategicDate } from '@/types';
import { cn, formatDate } from '@/lib/utils';
import { getCalendarDays, isSameMonth, isSameDay, isToday, format, formatCalendarDate, ptBR } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight, Megaphone, Clock, User, StickyNote } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/actions/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import { CONTENT_FORMATS } from '@/lib/constants';

interface MiniCalendarProps {
  actions: Action[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  campaigns?: Campaign[];
  strategicDates?: StrategicDate[];
  onOpenCalendar?: (date: string) => void;
}

interface DragState {
  startX: number;
  startY: number;
  delta: number;
  hMode: boolean | null;
  snapping: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  briefing: '#3b82f6',
  in_production: '#eab308',
  sharks_review: '#a855f7',
  scheduled: '#6366f1',
  published: '#22c55e',
  completed: '#10b981',
  cancelled: '#f87171',
  overdue: '#f97316',
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const SWIPE_THRESHOLD = 60;

const ENV_LABEL: Record<string, string> = {
  sharks_company: 'Sharks',
  estrategos: 'Estrategos',
};

export default function MiniCalendar({ actions, selectedDate, onSelectDate, campaigns = [], strategicDates = [], onOpenCalendar }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(selectedDate + 'T00:00:00'));
  const [slide, setSlide] = useState<1 | -1 | 0>(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
  }, []);

  const days = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);

  const actionsByDay = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of actions) {
      if (a.status === 'cancelled') continue;
      const list = map.get(a.action_date);
      if (list) list.push(a);
      else map.set(a.action_date, [a]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.action_time || '').localeCompare(b.action_time || ''));
    }
    return map;
  }, [actions]);

  const monthKey = formatCalendarDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));

  const monthLabel = useMemo(() => {
    const raw = format(currentMonth, 'MMMM yyyy', { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentMonth]);

  const selected = useMemo(() => {
    try { return new Date(selectedDate + 'T00:00:00'); } catch { return new Date(); }
  }, [selectedDate]);

  const goMonth = (dir: 1 | -1) => {
    setSlide(dir);
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(formatCalendarDate(now));
  };

  const handleDayTap = (dateStr: string) => {
    onSelectDate(dateStr);
    const list = actionsByDay.get(dateStr);
    if (list && list.length > 0) setModalDate(dateStr);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, startY: e.clientY, delta: 0, hMode: null, snapping: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    setDrag(d => {
      if (!d || d.hMode === false || d.snapping) return d;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.hMode === null) {
        if (Math.abs(dx) > 10) return { ...d, hMode: true, delta: dx };
        if (Math.abs(dy) > 10) return { ...d, hMode: false };
        return d;
      }
      return { ...d, delta: dx * 0.9 };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag || drag.snapping) return;
    if (drag.hMode === null) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-date]') as HTMLElement | null;
      const date = el?.dataset?.date;
      if (date) handleDayTap(date);
      setDrag(null);
    } else if (drag.hMode === true) {
      if (Math.abs(drag.delta) > SWIPE_THRESHOLD) {
        goMonth(drag.delta > 0 ? -1 : 1);
        setDrag(null);
      } else {
        setDrag({ ...drag, snapping: true });
      }
    } else {
      setDrag(null);
    }
  };

  // Snap back animado quando o swipe nao chegou ao threshold
  useEffect(() => {
    if (!drag?.snapping) return;
    const raf = requestAnimationFrame(() => setDrag(d => (d ? { ...d, delta: 0, snapping: false } : null)));
    return () => cancelAnimationFrame(raf);
  }, [drag?.snapping]);

  const slideClass =
    mounted.current && slide === 1 ? 'cal-slide-left' : mounted.current && slide === -1 ? 'cal-slide-right' : '';

  const gridStyle =
    drag && drag.hMode === true
      ? { transform: `translateX(${drag.delta}px)`, transition: drag.snapping ? 'transform 180ms ease' : 'none' }
      : undefined;

  return (
    <div className="select-none">
      {/* Header estilo Google Calendar: mes a esquerda, controles a direita */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span key={monthKey} className={cn('text-base sm:text-lg font-semibold text-gray-900', slideClass)}>
          {monthLabel}
        </span>
        <div className="flex items-center rounded-lg border border-gray-200 bg-white divide-x divide-gray-200 overflow-hidden">
          <button
            onClick={goToday}
            className="text-xs font-medium text-primary-600 hover:bg-primary-50 hover:text-primary-700 px-3 h-8 flex items-center transition-colors"
          >
            Hoje
          </button>
          <button onClick={() => goMonth(-1)} className="w-9 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors" aria-label="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => goMonth(1)} className="w-9 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors" aria-label="Próximo mês">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="touch-pan-y cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
        <div key={monthKey} className={cn('will-change-transform', slideClass)} style={gridStyle}>
          {/* Dia da semana — fim de semana em laranja suave */}
          <div className="grid grid-cols-7 gap-px bg-transparent mb-px">
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  'text-center text-[11px] sm:text-xs font-semibold uppercase py-1.5 border-b border-gray-200',
                  i === 0 || i === 6 ? 'text-orange-500' : 'text-gray-400'
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid do mes: separadores via gap-px */}
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {days.map(day => {
              const dateStr = formatCalendarDate(day);
              const dayActions = actionsByDay.get(dateStr) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const isTodayFlag = isToday(day);
              const isSelected = isSameDay(day, selected);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              const dayCampaigns = campaigns.filter(c => {
                if (!c.start_date) return false;
                return dateStr >= c.start_date && dateStr <= (c.end_date || c.start_date);
              });
              const dayStrategic = strategicDates.filter(s => s.date === dateStr);

              return (
                <button
                  key={dateStr}
                  data-date={dateStr}
                  onClick={() => handleDayTap(dateStr)}
                  title={dayActions.length > 0 ? dayActions.map(a => a.title).join('\n') : undefined}
                  className={cn(
                    'calendar-cell relative flex flex-col items-stretch text-left p-1 sm:p-1.5 min-h-[72px] sm:min-h-[96px] md:min-h-[110px] group',
                    inMonth && !isWeekend && 'bg-white hover:bg-primary-50/60',
                    inMonth && isWeekend && 'bg-orange-50 hover:bg-orange-100/70',
                    !inMonth && 'bg-gray-100/60 text-gray-300 hover:bg-gray-100',
                    isSelected && 'ring-2 ring-primary-400 ring-inset bg-primary-50/30 z-10'
                  )}
                >
                  {/* Numero do dia */}
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium leading-none',
                        isTodayFlag && 'bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold shadow-sm shadow-primary-200',
                        !isTodayFlag && isSelected && 'ring-2 ring-primary-500 text-primary-700 font-semibold bg-primary-50',
                        !isTodayFlag && !isSelected && inMonth && isWeekend && 'text-orange-500',
                        !isTodayFlag && !isSelected && inMonth && !isWeekend && 'text-gray-700',
                        !isTodayFlag && !isSelected && !inMonth && 'text-gray-300'
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Faixas de campanha (all-day blocks) + data estrategica */}
                  <div className="flex items-center gap-0.5 mt-0.5 h-1.5">
                    {dayCampaigns.slice(0, 2).map(c => (
                      <span
                        key={c.id}
                        title={`${c.name}${c.start_date ? ` · ${c.start_date.split('-').reverse().join('/')} → ${(c.end_date || c.start_date).split('-').reverse().join('/')}` : ''}`}
                        className="h-1.5 rounded-full flex-1"
                        style={{ backgroundColor: c.color || '#3B82F6' }}
                      />
                    ))}
                    {dayStrategic.length > 0 && (
                      <span title="Data estratégica" className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    )}
                  </div>

                  {/* Chips de acao (estilo Google) */}
                  <div className="flex flex-col gap-0.5 mt-0.5 min-w-0 flex-1">
                    {dayActions.slice(0, 3).map((action, i) => {
                      const color = STATUS_COLORS[action.status] || '#9ca3af';
                      return (
                        <span
                          key={action.id}
                          className={cn(
                            'flex items-center gap-1 rounded-md px-1 py-0.5 leading-none overflow-hidden ring-1 ring-black/[0.03]',
                            i === 2 && 'hidden sm:flex'
                          )}
                          style={{ backgroundColor: `${color}1F` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[9px] sm:text-[10px] font-medium text-gray-700 truncate">
                            {action.action_time ? `${action.action_time.slice(0, 5)} ${action.title}` : action.title}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  {/* Contagem de acoes — centralizada na base da celula */}
                  {dayActions.length > 0 && (
                    <div className="flex justify-center pt-1 shrink-0">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[9px] font-bold leading-none ring-1',
                          isSelected
                            ? 'bg-primary-500 text-white ring-primary-500'
                            : 'bg-primary-100/80 text-primary-700 ring-primary-200/50'
                        )}
                      >
                        <span className="sm:hidden">{dayActions.length}</span>
                        <span className="hidden sm:inline">
                          {dayActions.length} {dayActions.length === 1 ? 'ação' : 'ações'}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Hover/tap: indicador de nova acao quando o dia esta vazio */}
                  {dayActions.length === 0 && inMonth && (
                    <span className="absolute bottom-1 right-1.5 w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      +
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2 h-2 rounded-full bg-primary-500" /> Ação
        </span>
        {campaigns.length > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Megaphone className="w-3 h-3" style={{ color: campaigns[0]?.color || '#3B82F6' }} /> Campanha
          </span>
        )}
        {strategicDates.length > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Data estratégica
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-orange-600">
          <span className="w-2 h-2 rounded-sm bg-orange-100 ring-1 ring-orange-200" /> Fim de semana
        </span>
        <span className="ml-auto text-[11px] text-gray-400">{actions.filter(a => a.status !== 'cancelled').length} ações no mês</span>
      </div>

      {/* Modal de detalhes do dia */}
      <DayActionsModal
        date={modalDate}
        actions={modalDate ? actionsByDay.get(modalDate) ?? [] : []}
        onClose={() => setModalDate(null)}
        onOpenCalendar={onOpenCalendar}
      />
    </div>
  );
}

function DayActionsModal({
  date,
  actions,
  onClose,
  onOpenCalendar,
}: {
  date: string | null;
  actions: Action[];
  onClose: () => void;
  onOpenCalendar?: (date: string) => void;
}) {
  const d = date ? new Date(date + 'T00:00:00') : null;
  const label = d
    ? format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : '';
  const capitalized = label ? label.charAt(0).toUpperCase() + label.slice(1) : '';

  return (
    <Modal isOpen={!!date} onClose={onClose} title={capitalized} size="md">
      {actions.length === 0 ? (
        <div className="py-8 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhuma ação neste dia</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {actions.map(action => {
            const color = STATUS_COLORS[action.status] || '#9ca3af';
            return (
              <div
                key={action.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 ring-1 ring-black/[0.03]"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                  <span className="text-xs font-bold text-gray-900">
                    {action.action_time ? action.action_time.slice(0, 5) : '—'}
                  </span>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{action.title}</p>
                    <StatusBadge status={action.status} size="sm" className="shrink-0" />
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {action.format && (
                      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-medium text-gray-600">
                        {CONTENT_FORMATS[action.format] || action.format}
                      </span>
                    )}
                    {action.campaign?.name && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                        style={{ backgroundColor: action.campaign.color || '#3B82F6' }}
                      >
                        {action.campaign.name}
                      </span>
                    )}
                    {action.workspace?.name && (
                      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-medium text-gray-600">
                        {action.workspace.name}
                      </span>
                    )}
                    {action.environment && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                        {ENV_LABEL[action.environment] || action.environment}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {action.responsible && (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar name={action.responsible.full_name} src={action.responsible.avatar_url} size="sm" />
                        <span className="text-gray-600">{action.responsible.full_name}</span>
                      </span>
                    )}
                    {action.observations && (
                      <span className="inline-flex items-center gap-1 max-w-full">
                        <StickyNote className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{action.observations}</span>
                      </span>
                    )}
                    {!action.responsible && !action.observations && (
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3 text-gray-400" /> Sem responsável definido</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {onOpenCalendar && date && (
            <div className="pt-2 text-center">
              <button
                onClick={() => onOpenCalendar(date)}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                Ver no calendário completo →
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 text-center text-[10px] text-gray-300">{date ? formatDate(date) : ''}</div>
    </Modal>
  );
}