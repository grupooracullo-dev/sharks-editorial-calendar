import { useMemo, useState } from 'react';
import { Action } from '@/types';
import { cn } from '@/lib/utils';
import { getCalendarDays, isSameMonth, isSameDay, isToday, format, formatCalendarDate, ptBR } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Cores dos indicadores por status da acao
const STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-400',
  briefing: 'bg-blue-400',
  in_production: 'bg-yellow-400',
  sharks_review: 'bg-purple-400',
  scheduled: 'bg-indigo-400',
  published: 'bg-green-400',
  completed: 'bg-emerald-400',
  cancelled: 'bg-red-300',
  overdue: 'bg-orange-400',
};

const MAX_DOTS = 3;

interface MiniCalendarProps {
  actions: Action[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function MiniCalendar({ actions, selectedDate, onSelectDate }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(selectedDate + 'T00:00:00'));

  const days = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);

  // Mapa de acoes por dia (fora do mes atual: ignora)
  const actionsByDay = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of actions) {
      if (a.status === 'cancelled') continue;
      const list = map.get(a.action_date);
      if (list) list.push(a);
      else map.set(a.action_date, [a]);
    }
    return map;
  }, [actions]);

  const monthLabel = useMemo(() => {
    const raw = format(currentMonth, 'MMMM yyyy', { locale: ptBR });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentMonth]);

  const selected = useMemo(() => {
    try {
      return new Date(selectedDate + 'T00:00:00');
    } catch {
      return new Date();
    }
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
      {/* Cabecalho do mes */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => goMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => goMonth(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Proximo mes"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
        <button
          onClick={goToday}
          className="text-[11px] font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-md transition-colors"
        >
          Hoje
        </button>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grade do mes */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(day => {
          const dateStr = formatCalendarDate(day);
          const dayActions = actionsByDay.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const isTodayFlag = isToday(day);
          const isSelected = isSameDay(day, selected);
          const dots = dayActions.slice(0, MAX_DOTS);
          const extra = dayActions.length - dots.length;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg mx-auto w-9 h-10 mb-0.5 transition-all duration-150',
                inMonth ? 'text-gray-700 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-50',
                isTodayFlag && !isSelected && 'ring-1 ring-primary-400',
                isSelected && 'bg-primary-500 text-white shadow-sm hover:bg-primary-600'
              )}
            >
              <span
                className={cn(
                  'text-xs leading-none font-medium',
                  isSelected && 'text-white',
                  isTodayFlag && !isSelected && 'text-primary-600 font-bold'
                )}
              >
                {day.getDate()}
              </span>

              {/* Indicadores de acoes */}
              {(dots.length > 0 || extra > 0) && (
                <span className="flex items-center gap-0.5 mt-1 h-1">
                  {dots.map((a, i) => (
                    <span
                      key={a.id}
                      className={cn(
                        'w-1 h-1 rounded-full',
                        isSelected
                          ? 'bg-white/90'
                          : inMonth
                          ? STATUS_DOT[a.status] || 'bg-gray-400'
                          : 'bg-gray-200'
                      )}
                    />
                  ))}
                  {extra > 0 && (
                    <span
                      className={cn(
                        'text-[8px] leading-none font-semibold',
                        isSelected ? 'text-white/90' : inMonth ? 'text-gray-400' : 'text-gray-200'
                      )}
                    >
                      +{extra}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-gray-100">
        {[
          ['Programado', 'bg-indigo-400'],
          ['Em produção', 'bg-yellow-400'],
          ['Publicado', 'bg-green-400'],
          ['Pendente', 'bg-gray-400'],
        ].map(([label, dot]) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
