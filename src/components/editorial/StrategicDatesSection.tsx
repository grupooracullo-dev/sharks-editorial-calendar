import { useState, useMemo } from 'react';
import { StrategicDate } from '@/types';
import { useStrategicDates } from '@/hooks/useStrategicDates';
import { manualCityBirthday, BR_STATES } from '@/data/brDates';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import { CalendarDays, Plus, Trash2, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

function daysUntil(isoDate: string): number {
  const now = new Date();
  const d = new Date(isoDate + 'T00:00:00Z');
  return Math.ceil((d.getTime() - Date.UTC(now.getFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000);
}

function countdownLabel(days: number): { text: string; color: string } {
  if (days < 0) return { text: `${Math.abs(days)}d atrás`, color: 'bg-gray-100 text-gray-500' };
  if (days === 0) return { text: 'Hoje!', color: 'bg-red-100 text-red-700' };
  if (days <= 3) return { text: `${days}d`, color: 'bg-red-100 text-red-700' };
  if (days <= 7) return { text: `${days}d`, color: 'bg-amber-100 text-amber-700' };
  if (days <= 30) return { text: `${days}d`, color: 'bg-primary-100 text-primary-700' };
  return { text: `${days}d`, color: 'bg-gray-100 text-gray-600' };
}

const CATEGORY_LABELS: Record<string, string> = {
  holiday: 'Feriado',
  commercial: 'Comercial',
  segment: 'Segmento',
  custom: 'Custom',
};

const RELEVANCE_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};

export default function StrategicDatesSection({ workspaceId }: { workspaceId: string }) {
  const { dates, create, remove } = useStrategicDates(workspaceId);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newCategory, setNewCategory] = useState('commercial');
  const [newRelevance, setNewRelevance] = useState('medium');
  const [manualInput, setManualInput] = useState('');
  const [expanded, setExpanded] = useState(true);

  const upcoming = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 90 * 86400000);
    return dates
      .filter(d => {
        const dt = new Date(d.date + 'T00:00:00Z');
        return dt >= new Date(Date.UTC(now.getFullYear(), now.getUTCMonth(), now.getUTCDate())) && dt <= cutoff;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dates]);

  const past = useMemo(() => {
    const now = new Date();
    return dates.filter(d => new Date(d.date + 'T00:00:00Z') < new Date(Date.UTC(now.getFullYear(), now.getUTCMonth(), now.getUTCDate())));
  }, [dates]);

  const urgentAlerts = upcoming.filter(d => daysUntil(d.date) <= 7 && d.relevance === 'high');

  const handleAdd = async () => {
    if (!newTitle.trim() || !newDate.trim()) { toast.error('Preencha título e data'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { toast.error('Formato: YYYY-MM-DD'); return; }
    await create([{ title: newTitle.trim(), date: newDate, category: newCategory, relevance: newRelevance }]);
    setNewTitle(''); setNewDate(''); setAddOpen(false);
    toast.success('Data adicionada');
  };

  const handleManual = async () => {
    const draft = manualCityBirthday('Cidade', manualInput);
    if (!draft) { toast.error('Formato inválido (use DD/MM)'); return; }
    await create([draft]);
    setManualInput('');
    toast.success(`Aniversário adicionado`);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    toast.success('Removida');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary-500" />
          Datas Estratégicas
        </CardTitle>
        <div className="flex items-center gap-2">
          {urgentAlerts.length > 0 && (
            <Badge variant="danger" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {urgentAlerts.length} alerta{urgentAlerts.length > 1 ? 's' : ''}
            </Badge>
          )}
          <Badge variant="primary">{dates.length} data{dates.length !== 1 ? 's' : ''}</Badge>
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      {!expanded && (
        <p className="text-xs text-gray-400 px-6 pb-4">
          {upcoming.length} nos próximos 90 dias · {past.length} passadas
        </p>
      )}

      {expanded && (
        <div className="space-y-3">
          {urgentAlerts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              {urgentAlerts.map(d => (
                <p key={d.id} className="text-sm text-red-700">
                  <strong>{d.title}</strong> — {daysUntil(d.date) === 0 ? 'hoje' : `daqui a ${daysUntil(d.date)} dia${daysUntil(d.date) !== 1 ? 's' : ''}`}
                </p>
              ))}
            </div>
          )}

          {upcoming.length === 0 && past.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="Nenhuma data estratégica"
              description="Adicione datas de comemorações, datas comemorativas e momentos do cliente."
              action={
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              }
            />
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Próximos 90 dias</p>
              <div className="space-y-1.5">
                {upcoming.map(d => {
                  const days = daysUntil(d.date);
                  const c = countdownLabel(days);
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 group">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${c.color}`}>{c.text}</span>
                      <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{d.title}</span>
                      <span className="text-xs text-gray-400 shrink-0">{d.date}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${RELEVANCE_COLORS[d.relevance] || RELEVANCE_COLORS.medium}`}>
                        {d.relevance === 'high' ? 'alta' : d.relevance === 'medium' ? 'média' : 'baixa'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
                        {CATEGORY_LABELS[d.category ?? 'custom'] ?? d.category}
                      </span>
                      <button onClick={() => handleDelete(d.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Passadas</p>
              <div className="space-y-1.5">
                {past.slice(0, 5).map(d => {
                  const days = daysUntil(d.date);
                  const c = countdownLabel(days);
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50/50 opacity-60 group">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 ${c.color}`}>{c.text}</span>
                      <span className="flex-1 min-w-0 text-sm text-gray-600 truncate">{d.title}</span>
                      <span className="text-xs text-gray-400 shrink-0">{d.date}</span>
                      <button onClick={() => handleDelete(d.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Nova data
            </Button>
          </div>
        </div>
      )}

      {/* Add modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Nova Data Estratégica" size="sm">
        <div className="space-y-4">
          <Input label="Título" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Dia do Cliente" />
          <Input label="Data" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          <Select label="Categoria" value={newCategory} onChange={e => setNewCategory(e.target.value)} options={[
            { value: 'commercial', label: 'Comercial' },
            { value: 'holiday', label: 'Feriado' },
            { value: 'segment', label: 'Segmento' },
            { value: 'custom', label: 'Custom' },
          ]} />
          <Select label="Relevância" value={newRelevance} onChange={e => setNewRelevance(e.target.value)} options={[
            { value: 'high', label: 'Alta' },
            { value: 'medium', label: 'Média' },
            { value: 'low', label: 'Baixa' },
          ]} />
          <Button onClick={handleAdd} className="w-full">Salvar</Button>
        </div>
      </Modal>
    </Card>
  );
}
