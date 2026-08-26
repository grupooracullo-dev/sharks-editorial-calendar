import { useState } from 'react';
import { ContentFormat, Objective, ActionStatus, FunnelStage, EnvironmentType, ActionType } from '@/types';
import { CONTENT_FORMATS, OBJECTIVES, FUNNEL_STAGES, ACTION_STATUSES, ACTION_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Filter, X, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/Button';

interface CalendarFiltersProps {
  onFilterChange: (filters: Record<string, string>) => void;
  activeFilters: Record<string, string>;
  environment?: EnvironmentType;
}

export default function CalendarFilters({ onFilterChange, activeFilters, environment = 'sharks_company' }: CalendarFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeCount = Object.values(activeFilters).filter(Boolean).length;

  const handleFilter = (key: string, value: string) => {
    const newFilters = { ...activeFilters, [key]: value || '' };
    onFilterChange(newFilters);
  };

  const clearAll = () => {
    onFilterChange({});
  };

  const isEstrategos = environment === 'estrategos';

  const filterGroups = isEstrategos
    ? [
        { key: 'status', label: 'Status', options: Object.entries(ACTION_STATUSES).map(([v, l]) => ({ value: v, label: l.label })) },
        { key: 'actionType', label: 'Tipo', options: [
          { value: 'meeting', label: ACTION_TYPES.meeting },
          { value: 'implementation', label: ACTION_TYPES.implementation },
          { value: 'milestone', label: ACTION_TYPES.milestone },
          { value: 'onboarding', label: ACTION_TYPES.onboarding },
          { value: 'review', label: ACTION_TYPES.review },
          { value: 'follow_up', label: ACTION_TYPES.follow_up },
          { value: 'strategy', label: ACTION_TYPES.strategy },
          { value: 'training', label: ACTION_TYPES.training },
          { value: 'event', label: ACTION_TYPES.event },
          { value: 'other', label: ACTION_TYPES.other },
        ]},
      ]
    : [
        { key: 'format', label: 'Formato', options: Object.entries(CONTENT_FORMATS).map(([v, l]) => ({ value: v, label: l })) },
        { key: 'status', label: 'Status', options: Object.entries(ACTION_STATUSES).map(([v, l]) => ({ value: v, label: l.label })) },
        { key: 'objective', label: 'Objetivo', options: Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: l })) },
        { key: 'funnel_stage', label: 'Etapa do Funil', options: Object.entries(FUNNEL_STAGES).map(([v, l]) => ({ value: v, label: l })) },
      ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={isOpen ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Filter className="w-4 h-4" />
          Filtros
          {activeCount > 0 && (
            <span className="ml-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="w-3 h-3" />
            Limpar filtros
          </Button>
        )}

        {Object.entries(activeFilters).filter(([_, v]) => v).map(([key, value]) => {
          const group = filterGroups.find(g => g.key === key);
          const option = group?.options.find(o => o.value === value);
          if (!option) return null;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
            >
              {option.label}
              <button onClick={() => handleFilter(key, '')} className="hover:text-primary-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
      </div>

      {isOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {filterGroups.map(group => (
            <div key={group.key}>
              <button
                onClick={() => setExpanded(expanded === group.key ? null : group.key)}
                className="flex items-center justify-between w-full text-xs font-medium text-gray-700 mb-2"
              >
                {group.label}
                <ChevronDown className={cn('w-3 h-3 transition-transform', expanded === group.key && 'rotate-180')} />
              </button>
              {expanded === group.key && (
                <div className="space-y-1 mt-1">
                  {group.options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleFilter(group.key, activeFilters[group.key] === opt.value ? '' : opt.value)}
                      className={cn(
                        'block w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors',
                        activeFilters[group.key] === opt.value
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
