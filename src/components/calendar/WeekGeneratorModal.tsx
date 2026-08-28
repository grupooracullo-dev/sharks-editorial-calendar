import { useState, useEffect } from 'react';
import { GeneratedAction, WeekGeneratorResult, EditorialProfile, EditorialPillar, Action, StrategicDate, Campaign, ContentFormat, Objective } from '@/types';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { CONTENT_FORMATS, OBJECTIVES } from '@/lib/constants';
import { generateWeek } from '@/lib/weekGenerator';
import { useActions } from '@/hooks/useActions';
import { formatCalendarDate, addDays, startOfWeek, parseISO, format } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { Sparkles, Check, X, RefreshCw, Lock, Unlock, ChevronLeft, ChevronRight, AlertTriangle, BarChart3, Layers } from 'lucide-react';

interface WeekGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  profile?: EditorialProfile;
  pillars: EditorialPillar[];
  existingActions: Action[];
  strategicDates: StrategicDate[];
  activeCampaigns: Campaign[];
  channels?: string[];
}

export default function WeekGeneratorModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  profile,
  pillars,
  existingActions,
  strategicDates,
  activeCampaigns,
  channels = [],
}: WeekGeneratorModalProps) {
  const [result, setResult] = useState<WeekGeneratorResult | null>(null);
  const [weekStart, setWeekStart] = useState<string>('');
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const { create } = useActions({});
  const [saving, setSaving] = useState(false);
  const [selectedPillars, setSelectedPillars] = useState<Set<string>>(new Set());

  // Próxima segunda-feira (limite mínimo do período)
  const minWeekStart = formatCalendarDate(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7));
  const isCurrentWeek = weekStart === minWeekStart;

  // Inicializa com os pilares ativos + semana padrão ao abrir
  useEffect(() => {
    if (isOpen) {
      const activeIds = pillars.filter(p => p.is_active).map(p => p.id);
      setSelectedPillars(new Set(activeIds));
      setWeekStart(minWeekStart);
    }
  }, [isOpen, pillars, minWeekStart]);

  const weekStartDate = parseISO(weekStart + 'T00:00:00');
  const weekEndDate = addDays(weekStartDate, 6);

  const shiftWeek = (days: number) => {
    setWeekStart(s => formatCalendarDate(addDays(parseISO(s + 'T00:00:00'), days)));
  };

  const handlePickWeek = (value: string) => {
    if (!value) return;
    // Ajusta qualquer dia da semana para a segunda-feira correspondente
    setWeekStart(formatCalendarDate(startOfWeek(parseISO(value + 'T00:00:00'), { weekStartsOn: 1 })));
  };

  const handleGenerate = () => {
    if (!profile) {
      toast.error('Configure o perfil editorial primeiro em Linha Editorial.');
      return;
    }

    if (selectedPillars.size === 0) {
      toast.error('Selecione pelo menos um pilar.');
      return;
    }

    const filteredPillars = pillars.filter(p => selectedPillars.has(p.id));
    const recentFormats = existingActions.map(a => a.format).filter(Boolean) as ContentFormat[];
    const recentPillars = existingActions.map(a => a.editorial_pillar_id).filter(Boolean) as string[];
    const recentObjectives = existingActions.map(a => a.objective).filter(Boolean) as Objective[];

    const generated = generateWeek({
      profile,
      pillars: filteredPillars,
      existingActions,
      strategicDates,
      activeCampaigns,
      recentFormats,
      recentPillars,
      recentObjectives,
      channels,
      weekStart: weekStartDate,
    });

    setResult(generated);
    setLocked(new Set());
  };

  const handleRegenerate = () => {
    if (!result) return;
    const kept = result.actions.filter((_, i) => locked.has(i));
    const keptFormats = kept.map(a => a.format) as ContentFormat[];
    const keptPillars = kept.map(a => a.editorial_pillar_id);
    const keptObjectives = kept.map(a => a.objective) as Objective[];

    if (!profile) return;
    const filteredPillars = pillars.filter(p => selectedPillars.has(p.id));
    const newResult = generateWeek({
      profile,
      pillars: filteredPillars,
      existingActions: [...existingActions, ...kept] as Action[],
      strategicDates,
      activeCampaigns,
      recentFormats: keptFormats,
      recentPillars: keptPillars,
      recentObjectives: keptObjectives,
      channels,
      weekStart: weekStartDate,
    });

    // Merge: locked actions stay, unlocked replaced
    const merged = result.actions.map((a, i) => locked.has(i) ? a : newResult.actions[i] || a);
    // If new has more, append unlocked from new
    const extras = newResult.actions.slice(result.actions.length);
    setResult({ ...newResult, actions: [...merged, ...extras] });
  };

  const toggleLock = (index: number) => {
    setLocked(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!result || result.actions.length === 0 || saving) return;

    setSaving(true);
    try {
      let created = 0;
      for (const ga of result.actions) {
        const res = await create({
          ...ga,
          workspace_id: workspaceId,
          is_auto_generated: true,
        });
        if (res.ok) created++;
      }
      toast.success(`${created} ações criadas como rascunho para ${workspaceName}!`);
      setResult(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gerar Semana Editorial" size="xl">
      <div className="space-y-4">
        {/* Week selector */}
        <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-4 py-2">
          <button
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={isCurrentWeek}
            onClick={() => shiftWeek(-7)}
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                Semana de {format(weekStartDate, 'dd/MM')} a {format(weekEndDate, 'dd/MM')}
              </p>
              <p className="text-[11px] text-gray-400">
                {isCurrentWeek ? 'Próxima semana' : 'Escolha o período no calendário'}
              </p>
            </div>
            <input
              type="date"
              value={weekStart}
              min={minWeekStart}
              onChange={e => handlePickWeek(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-400"
              title="Início do período das publicações"
            />
          </div>
          <button
            className="p-1 text-gray-500 hover:text-gray-700"
            onClick={() => shiftWeek(7)}
            title="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs text-blue-700 leading-relaxed">
            O motor editorial analisa o perfil de <strong>{workspaceName}</strong>, campanhas ativas,
            datas comemorativas e histórico recente para gerar uma semana equilibrada.
            Clique no cadeado para manter uma ação entre re-gerações. As ações entram como <strong>rascunhos</strong>.
          </p>
        </div>

        {!profile && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              Este cliente ainda não possui perfil editorial. Configure em <strong>Linha Editorial</strong>.
            </p>
          </div>
        )}

        {/* Pillar selection */}
        {profile && !result && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-medium text-gray-600">Pilares para esta semana</span>
              <span className="text-[10px] text-gray-400 ml-1">
                ({selectedPillars.size} de {pillars.filter(p => p.is_active).length} selecionados)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {pillars.filter(p => p.is_active).map(pillar => {
                const isSelected = selectedPillars.has(pillar.id);
                return (
                  <button
                    key={pillar.id}
                    onClick={() => {
                      setSelectedPillars(prev => {
                        const next = new Set(prev);
                        if (isSelected) next.delete(pillar.id);
                        else next.add(pillar.id);
                        return next;
                      });
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                      isSelected
                        ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
                    }`}
                  >
                    {pillar.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Generated preview */}
        {result && (
          <div className="space-y-3">
            {/* Coverage */}
            {result.coverage && Object.keys(result.coverage).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600">Cobertura de pilares</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.coverage).map(([name, { target, assigned, pct }]) => (
                    <span key={name} className={`text-[11px] px-2 py-0.5 rounded-full ${
                      pct >= 80 ? 'bg-green-100 text-green-700' :
                      pct >= 50 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {name}: {assigned}/{target} ({pct}%)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm font-medium text-gray-700">{result.summary}</p>

            {result.actions.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 text-center">
                Nenhuma ação gerada. Verifique os dias permitidos e pilares ativos.
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto space-y-1.5 pr-1">
                {result.actions.map((ga, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      locked.has(i) ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => toggleLock(i)}
                      className="p-1 rounded hover:bg-white/50 transition-colors flex-shrink-0"
                      title={locked.has(i) ? 'Desbloquear (permitir regenerar)' : 'Bloquear (manter entre re-gerações)'}
                    >
                      {locked.has(i)
                        ? <Lock className="w-3.5 h-3.5 text-primary-600" />
                        : <Unlock className="w-3.5 h-3.5 text-gray-300" />
                      }
                    </button>
                    <span className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-700 flex-shrink-0">
                      {new Date(ga.action_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{ga.title}</p>
                      <p className="text-[11px] text-gray-400">
                        {ga.action_time?.slice(0, 5)} · {CONTENT_FORMATS[ga.format] || ga.format} · {ga.channel}
                      </p>
                      {ga.reasons && ga.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ga.reasons.map((r, ri) => (
                            <span
                              key={ri}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                r.includes('Data estratégica')
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-500 italic'
                              }`}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge variant="primary" size="sm">{OBJECTIVES[ga.objective]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-gray-100">
          {!result ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                <X className="w-4 h-4" /> Cancelar
              </Button>
              <Button onClick={handleGenerate}>
                <Sparkles className="w-4 h-4" /> Gerar sugestão
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleRegenerate} disabled={result.actions.length === 0}>
                <RefreshCw className="w-4 h-4" /> Regenerar desbloqueados
              </Button>
              <Button variant="outline" onClick={() => setResult(null)}>Limpar</Button>
              <Button variant="success" onClick={handleApprove} loading={saving} disabled={result.actions.length === 0}>
                <Check className="w-4 h-4" /> Aprovar e criar rascunhos
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
