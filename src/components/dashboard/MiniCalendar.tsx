import { useMemo, useState } from 'react';
import { Action, Campaign, StrategicDate } from '@/types';
import { cn } from '@/lib/utils';
import { getCalendarDays, isSameMonth, isSameDay, isToday, format, formatCalendarDate, ptBR } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';

interface MiniCalendarProps {
  actions: Action[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  campaigns?: Campaign[];
  strategicDates?: StrategicDate[];
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

export default function MiniCalendar({ actions, selectedDate, onSelectDate, campaigns = [], strategicDates = [] }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(selectedDate + 'T00:00:00'));

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

  const monthLabel = useMemo(() => {
    const raw = format(currentMonth, 'MMMM yyyy', { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentMonth]);

  const selected = useMemo(() => {
    try { return new Date(selectedDate + 'T00:00:00'); } catch { return new Date(); }
  }, [selectedDate]);

  const goMonth = (dir: 1 | -1) =>
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(formatCalendarDate(now));
  };

  return (
    <div className="select-none">
      {/* Header estilo Google Calendar: mes a esquerda, controles a direita */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="text-base sm:text-lg font-semibold text-gray-900">{monthLabel}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToday}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-primary-50 transition-colors"
          >
            Hoje
          </button>
          <button onClick={() => goMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => goMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Próximo mês">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dia da semana */}
      <div className="grid grid-cols-7 gap-px bg-transparent mb-px">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] sm:text-xs font-semibold text-gray-400 uppercase py-1.5 border-b border-gray-200">
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
              onClick={() => onSelectDate(dateStr)}
              title={dayActions.length > 0 ? dayActions.map(a => a.title).join('\n') : undefined}
              className={cn(
                'relative flex flex-col items-stretch text-left p-1 sm:p-1.5 min-h-[76px] sm:min-h-[96px] md:min-h-[110px] transition-colors group',
                inMonth && !isWeekend && 'bg-white hover:bg-primary-50/60',
                inMonth && isWeekend && 'bg-gray-50/60 hover:bg-primary-50/60',
                !inMonth && 'bg-gray-100/50 text-gray-300 hover:bg-gray-100',
                isTodayFlag && 'bg-primary-50/40',
                isSelected && 'ring-2 ring-primary-400 ring-inset z-10'
              )}
            >
              {/* Numero do dia + contagem */}
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium leading-none',
                    isTodayFlag ? 'bg-primary-500 text-white font-bold shadow-sm' : 'ring-transparent',
                    !isTodayFlag && isSelected && 'ring-2 ring-primary-500 text-primary-700 font-semibold',
                    !isTodayFlag && !isSelected && inMonth && 'text-gray-700',
                    !isTodayFlag && !isSelected && !inMonth && 'text-gray-300'
                  )}
                >
                  {day.getDate()}
                </span>
                {dayActions.length > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 min-w-[18px] text-[9px] font-bold text-center leading-4',
                      isSelected ? 'bg-primary-500 text-white' : 'bg-primary-100 text-primary-700'
                    )}
                  >
                    {dayActions.length}
                  </span>
                )}
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
                        'flex items-center gap-1 rounded px-1 py-0.5 leading-none overflow-hidden',
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
                {dayActions.length > 3 && (
                  <span className="text-[9px] text-gray-400 px-0.5 leading-none">
                    +{dayActions.length - 3} mais
                  </span>
                )}
              </div>

              {/* Hover: indicador de adicionar */}
              {!isSelected && (
                <span className="absolute top-1 right-1.5 w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  +
                </span>
              )}
            </button>
          );
        })}
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
        {dayStatsIndicator()}
      </div>
    </div>
  );

  function dayStatsIndicator() {
    const total = actions.filter(a => a.status !== 'cancelled').length;
    if (total === 0) return null;
    return <span className="ml-auto text-[11px] text-gray-400">{total} ações no mês</span>;
  }
}