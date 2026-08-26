import { useState } from 'react';
import { Calendar, SplitSquareHorizontal, Table2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncMode } from '@/types';

interface SyncModeSelectorProps {
  value: SyncMode;
  onChange: (mode: SyncMode) => void;
}

export default function SyncModeSelector({ value, onChange }: SyncModeSelectorProps) {
  const options: Array<{ id: SyncMode; icon: typeof Table2; title: string; desc: string; badge?: string }> = [
    {
      id: 'split',
      icon: SplitSquareHorizontal,
      title: 'Agendas separadas por empresa',
      desc: 'Criamos "Sharks" e "Estrategos" no seu Google Calendar — ligue, desligue e colore cada um à vontade.',
      badge: 'Recomendado',
    },
    {
      id: 'unified',
      icon: Table2,
      title: 'Uma agenda só',
      desc: 'Tudo junto na agenda escolhida, com [Sharks] / [Estrategos] no título de cada evento.',
    },
  ];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Como você quer receber seus eventos?</label>
      <div className="space-y-2">
        {options.map(opt => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.id)}
              className={cn(
                'w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                active
                  ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-primary-500' : 'border-gray-300',
                )}
              >
                {active && <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />}
              </span>
              <opt.icon className={cn('w-5 h-5 shrink-0 mt-0.5', active ? 'text-primary-500' : 'text-gray-400')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-sm font-medium', active ? 'text-primary-700' : 'text-gray-900')}>{opt.title}</span>
                  {opt.badge && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">
                      {opt.badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-start gap-2 text-xs text-gray-400">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>Você pode trocar o modo depois em "Trocar modo". Eventos já criados permanecem; os novos seguem o modo atual.</p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <Calendar className="w-3 h-3" />
        <span>Uma única autorização Google em qualquer modo.</span>
      </div>
    </div>
  );
}

/** Painel de estado por ambiente (modo split conectado). */
export function EnvSyncToggles({
  envAutoSync,
  onToggle,
  disabled,
}: {
  envAutoSync: Record<string, boolean> | null | undefined;
  onToggle: (env: 'sharks_company' | 'estrategos', enabled: boolean) => void;
  disabled?: boolean;
}) {
  const envs: Array<{ id: 'sharks_company' | 'estrategos'; label: string; emoji: string }> = [
    { id: 'sharks_company', label: 'Sharks Company', emoji: '🦈' },
    { id: 'estrategos', label: 'Estrategos', emoji: '📊' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {envs.map(e => {
        const enabled = envAutoSync?.[e.id] !== false;
        return (
          <button
            key={e.id}
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={disabled}
            onClick={() => onToggle(e.id, !enabled)}
            className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-base leading-none">{e.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">{e.label}</span>
                <span className={cn('block text-xs', enabled ? 'text-green-600' : 'text-gray-400')}>
                  {enabled ? 'Sincronizando' : 'Pausado'}
                </span>
              </span>
            </span>
            <span
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                enabled ? 'bg-primary-500' : 'bg-gray-300',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                  enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
                )}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
