import { LayoutGrid, Aperture, Clapperboard, Minus, Plus } from 'lucide-react';
import type { FormatFrequency, FormatFrequencyZone } from '@/types';

interface Props {
  value: FormatFrequency;
  onChange: (next: FormatFrequency) => void;
  disabled?: boolean;
}

const ZONES: { key: FormatFrequencyZone; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { key: 'feed',   label: 'Feed',   hint: 'Post, arte, foto ou vídeo', icon: LayoutGrid },
  { key: 'story',  label: 'Story',  hint: 'Stories',                   icon: Aperture },
  { key: 'reels',  label: 'Reels',  hint: 'Reels',                     icon: Clapperboard },
];

const MAX_PER_ZONE = 9;

export function normalizeFormatFrequency(ff: FormatFrequency): FormatFrequency {
  return {
    feed: Math.max(0, Math.min(MAX_PER_ZONE, ff.feed ?? 0)),
    story: Math.max(0, Math.min(MAX_PER_ZONE, ff.story ?? 0)),
    reels: Math.max(0, Math.min(MAX_PER_ZONE, ff.reels ?? 0)),
  };
}

export function formatFrequencyTotal(ff: FormatFrequency): number {
  return (ff.feed ?? 0) + (ff.story ?? 0) + (ff.reels ?? 0);
}

export function defaultFormatFrequency(): FormatFrequency {
  return { feed: 2, story: 2, reels: 1 };
}

export default function FormatFrequencyStepper({ value, onChange, disabled }: Props) {
  const update = (key: FormatFrequencyZone, delta: number) => {
    const current = value[key] ?? 0;
    const nextCount = current + delta;
    if (nextCount < 0 || nextCount > MAX_PER_ZONE) return;
    const total = formatFrequencyTotal({ ...value, [key]: nextCount });
    if (total < 1) return;
    onChange({ ...value, [key]: nextCount });
  };

  const total = formatFrequencyTotal(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">Distribuição semanal por tipo</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${total > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
          Total: {total}/semana
        </span>
      </div>
      <div className="space-y-1.5">
        {ZONES.map(({ key, label, hint, icon: Icon }) => {
          const count = value[key] ?? 0;
          return (
            <div key={key} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gray-500" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-400 truncate">{hint}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => update(key, -1)}
                  disabled={disabled || count === 0}
                  className="w-7 h-7 rounded-md bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Remover ${label}`}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-semibold text-gray-900 tabular-nums">{count}</span>
                <button
                  type="button"
                  onClick={() => update(key, 1)}
                  disabled={disabled || count >= MAX_PER_ZONE || formatFrequencyTotal({ ...value, [key]: count + 1 }) > 14}
                  className="w-7 h-7 rounded-md bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label={`Adicionar ${label}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
