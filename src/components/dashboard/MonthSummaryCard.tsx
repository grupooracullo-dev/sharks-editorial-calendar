import { useMemo } from 'react';
import { Action } from '@/types';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import { CONTENT_FORMATS } from '@/lib/constants';
import { formatCalendarDate, startOfMonth, endOfMonth, format, ptBR } from '@/lib/dateUtils';
import { CalendarRange } from 'lucide-react';

interface MonthSummaryCardProps {
  actions: Action[];
}

export default function MonthSummaryCard({ actions }: MonthSummaryCardProps) {
  const today = new Date();
  const monthStart = formatCalendarDate(startOfMonth(today));
  const monthEnd = formatCalendarDate(endOfMonth(today));

  const stats = useMemo(() => {
    const monthActions = actions.filter(
      a => a.action_date >= monthStart && a.action_date <= monthEnd && a.status !== 'cancelled'
    );
    const count = (statuses: string[]) => monthActions.filter(a => statuses.includes(a.status)).length;
    const published = count(['published', 'completed']);
    const progress = monthActions.length > 0 ? Math.round((published / monthActions.length) * 100) : 0;
    const byFormat = monthActions.reduce((acc, a) => {
      if (a.format) acc[a.format] = (acc[a.format] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      total: monthActions.length,
      published,
      production: count(['in_production']),
      scheduled: count(['scheduled']),
      pending: count(['draft', 'briefing', 'sharks_review']),
      progress,
      byFormat,
    };
  }, [actions, monthStart, monthEnd]);

  const monthLabel = format(today, 'MMMM yyyy', { locale: ptBR });
  const capitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const boxes = [
    { label: 'Total', value: stats.total, cls: 'bg-gray-50 text-gray-900' },
    { label: 'Publicadas', value: stats.published, cls: 'bg-emerald-50 text-emerald-600' },
    { label: 'Em produção', value: stats.production, cls: 'bg-amber-50 text-amber-600' },
    { label: 'Agendadas', value: stats.scheduled, cls: 'bg-indigo-50 text-indigo-600' },
    { label: 'Pendentes', value: stats.pending, cls: 'bg-orange-50 text-orange-600' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
            <CalendarRange className="w-4 h-4" />
          </span>
          ESTE MÊS
        </CardTitle>
        <span className="text-xs text-gray-400 capitalize">{capitalized}</span>
      </CardHeader>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {boxes.map(b => (
          <div key={b.label} className={`rounded-xl p-3 text-center ${b.cls}`}>
            <p className="text-2xl font-bold leading-tight">{b.value}</p>
            <p className="text-[11px] mt-0.5 opacity-80">{b.label}</p>
          </div>
        ))}
      </div>

      {Object.keys(stats.byFormat).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {Object.entries(stats.byFormat)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([fmt, count]) => (
              <span key={fmt} className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                {count}× {CONTENT_FORMATS[fmt as keyof typeof CONTENT_FORMATS] || fmt}
              </span>
            ))}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Progresso do mês</span>
          <span className="font-semibold text-gray-900">{stats.progress}% concluídas</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${stats.progress}%` }}
          />
        </div>
      </div>
    </Card>
  );
}