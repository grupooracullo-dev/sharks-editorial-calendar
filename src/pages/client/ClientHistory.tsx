import { useMemo, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions } from '@/hooks/useActions';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/actions/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { CONTENT_FORMATS, ACTION_STATUSES } from '@/lib/constants';
import { formatDate, formatTime } from '@/lib/utils';
import { History as HistoryIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ClientHistory() {
  const { currentWorkspace } = useWorkspace();
  const { actions } = useActions(currentWorkspace ? { workspaceId: currentWorkspace.id } : {});
  const [monthOffset, setMonthOffset] = useState(0);

  const targetDate = new Date();
  if (monthOffset !== 0) {
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
  }
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();

  const monthName = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const monthActions = useMemo(() => {
    return actions
      .filter(a => {
        const d = new Date(a.action_date + 'T00:00:00');
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => b.action_date.localeCompare(a.action_date));
  }, [actions, year, month]);

  // Summary by format
  const formatSummary = useMemo(() => {
    return Object.entries(
      monthActions.reduce((acc, a) => {
        if (a.format) acc[a.format] = (acc[a.format] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).sort(([, a], [, b]) => b - a);
  }, [monthActions]);

  const publishedCount = monthActions.filter(a => ['published', 'completed'].includes(a.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Histórico</h1>
        <p className="text-sm text-gray-500 mt-0.5">Acompanhe tudo que já foi publicado</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o - 1)}>
          <ChevronLeft className="w-4 h-4" />
          Mês anterior
        </Button>
        <h2 className="text-lg font-semibold text-gray-900 capitalize">{monthName}</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={monthOffset >= 0}
          onClick={() => setMonthOffset(o => o + 1)}
        >
          Próximo mês
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Monthly summary */}
      <Card padding="sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900">{monthActions.length}</p>
            <p className="text-xs text-gray-500">conteúdos no mês</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-emerald-600">{publishedCount}</p>
            <p className="text-xs text-gray-500">publicados</p>
          </div>
          {formatSummary.slice(0, 2).map(([format, count]) => (
            <div key={format} className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">{CONTENT_FORMATS[format as keyof typeof CONTENT_FORMATS]}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* List */}
      {monthActions.length === 0 ? (
        <Card>
          <EmptyState icon={HistoryIcon} title={`Nenhuma ação em ${monthName}`} description="Navegue para outros meses para ver ações passadas." />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-gray-50">
            {monthActions.map(action => (
              <div key={action.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(action.action_date)}
                    {action.action_time && ` · ${formatTime(action.action_time)}`}
                    {action.format && ` · ${CONTENT_FORMATS[action.format]}`}
                  </p>
                </div>
                <StatusBadge status={action.status} size="sm" />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
