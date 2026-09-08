import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Search } from 'lucide-react';

interface SearchSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  emptyMessage?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Combobox pesquisável: digita para filtrar opções (sem acento/maiúsculas). */
export default function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Digite para buscar...',
  emptyMessage = 'Nenhum resultado encontrado',
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => norm(o.label).includes(norm(query)) || norm(o.value).includes(norm(query)))
    : options;

  return (
    <div className="w-full" ref={wrapRef}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <div className="relative">
        <div
          className={cn(
            'flex items-center gap-2 px-3 border rounded-lg bg-white transition-colors',
            open ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-gray-300'
          )}
        >
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            className="w-full py-2 text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
            value={open ? query : (selected?.label ?? '')}
            placeholder={placeholder}
            onFocus={() => { setOpen(true); setQuery(''); }}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          />
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 pointer-events-none" />
        </div>
        {open && (
          <div className="absolute z-20 w-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    o.value === value
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
