import { useMemo, useState } from 'react';
import { Action, Campaign, StrategicDate } from '@/types';
import { cn } from '@/lib/utils';
import { getCalendarDays, isSameMonth, isSameDay, isToday, format, formatCalendarDate, ptBR } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
  actions: Action[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  campaigns?: Campaign[];
  strategicDates?: StrategicDate[];
}

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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => goMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Mes anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => goMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Proximo mes">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
        <button onClick={goToday} className="text-[11px] font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-md transition-colors">
          Hoje
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(day => {
          const dateStr = formatCalendarDate(day);
          const dayActions = actionsByDay.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const isTodayFlag = isToday(day);
          const isSelected = isSameDay(day, selected);

          // Campanhas ativas neste dia
          const dayCampaigns = campaigns.filter(c => {
            if (!c.start_date) return false;
            return dateStr >= c.start_date && dateStr <= (c.end_date || c.start_date);
          });

          // Datas estratégicas neste dia
          const dayStrategic = strategicDates.filter(s => s.date === dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              title={dayActions.length > 0 ? dayActions.map(a => a.title).join('\n') : undefined}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg mx-auto w-9 h-11 mb-0.5 transition-all duration-150',
                inMonth ? 'text-gray-700 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-50',
                isTodayFlag && !isSelected && 'ring-1 ring-primary-400',
                isSelected && 'bg-primary-500 text-white shadow-sm hover:bg-primary-600'
              )}
            >
              <span className={cn('text-xs leading-none font-medium', isSelected && 'text-white', isTodayFlag && !isSelected && 'text-primary-600 font-bold')}>
                {day.getDate()}
              </span>

              {/* Indicadores: pontos de campanha + strategic */}
              {(dayCampaigns.length > 0 || dayStrategic.length > 0 || dayActions.length > 0) && (
                <span className="flex items-center gap-0.5 mt-1">
                  {dayCampaigns.slice(0, 2).map(c => (
                    <span key={c.id} className="w-1 h-1 rounded-full" style={{ backgroundColor: c.color || '#3B82F6' }} />
                  ))}
                  {dayStrategic.length > 0 && (
                    <span className="w-1 h-1 rounded-full bg-amber-400" />
                  )}
                  {dayActions.length > 0 && (
                    <span className={cn('rounded-full text-[8px] font-bold leading-none px-1 min-w-[12px] text-center', isSelected ? 'bg-white/90 text-primary-700' : 'bg-primary-100 text-primary-700')}>
                      {dayActions.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500" /> Ação
        </span>
        {campaigns.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: campaigns[0]?.color || '#3B82F6' }} /> Campanha
          </span>
        )}
        {strategicDates.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Estratégica
          </span>
        )}
      </div>
    </div>
  );
}
