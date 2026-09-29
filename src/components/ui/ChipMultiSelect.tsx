import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChipMultiSelectProps {
  label?: string;
  options: { id: string; name: string }[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

/** Multi-seleção com chips: busca + toggle. Reutilizado por ações e leads. */
export default function ChipMultiSelect({
  label, options, values, onChange, placeholder = 'Buscar e selecionar...', emptyMessage = 'Nenhum item cadastrado', disabled,
}: ChipMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.filter(o => values.includes(o.id)), [options, values]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(o => !values.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));
  }, [options, values, query]);

  const toggle = (id: string) =>
    onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(o => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100"
            >
              {o.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="hover:text-primary-900"
                  aria-label={`Remover ${o.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          value={open ? query : ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setOpen(false); setQuery(''); }}
          disabled={disabled}
          placeholder={selected.length > 0 ? 'Adicionar outro...' : placeholder}
          className={cn(
            'w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:border-primary-500',
            'placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400',
          )}
        />
        {open && !disabled && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">{emptyMessage}</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { toggle(o.id); setQuery(''); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
