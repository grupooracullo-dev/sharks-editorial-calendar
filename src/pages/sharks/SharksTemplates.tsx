import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEditorial } from '@/hooks/useEditorial';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { CONTENT_FORMATS } from '@/lib/constants';
import { ContentFormat, Objective, FunnelStage, CalendarTemplate } from '@/types';
import { bulkCreateActions } from '@/lib/actionService';
import { supabase } from '@/lib/supabase';
import { addDays, startOfWeek, formatCalendarDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { LayoutTemplate, Check, X } from 'lucide-react';

// Maps objective -> funnel stage (same logic as week generator)
function objectiveToStage(objective: Objective): FunnelStage {
  const map: Record<Objective, FunnelStage> = {
    brand_awareness: 'discovery',
    positioning: 'interest',
    authority: 'interest',
    educational: 'consideration',
    engagement: 'relationship',
    relationship: 'relationship',
    traffic: 'interest',
    lead_conversion: 'conversion',
    sale_conversion: 'conversion',
    social_proof: 'consideration',
    launch: 'conversion',
    loyalty: 'repurchase',
    repurchase: 'repurchase',
    retention: 'relationship',
    reactivation: 'interest',
  };
  return map[objective] || 'consideration';
}

export default function SharksTemplates() {
  const { currentWorkspace } = useWorkspace();
  const { pillars } = useEditorial(currentWorkspace?.id);
  const [templates, setTemplates] = useState<CalendarTemplate[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<CalendarTemplate | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('calendar_templates')
        .select('*')
        .order('name');
      if (error) console.error('[templates] load error:', error.message);
      setTemplates((data as unknown as CalendarTemplate[]) || []);
    })();
  }, []);

  const handleApply = async (template: CalendarTemplate) => {
    if (!currentWorkspace) return;

    setApplying(true);
    try {
      const nextWeekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 7);
      const allowedDates = template.allowed_days
        .map(dayOffset => addDays(nextWeekStart, dayOffset))
        .map(d => formatCalendarDate(d));

      // Sort pillars by percentage desc for proportional cycling
      const sortedPillars = [...pillars].sort((a, b) => b.percentage - a.percentage);

      const rows = [];
      for (let i = 0; i < template.num_contents && i < allowedDates.length; i++) {
        const format = template.formats[i % template.formats.length];
        const objective = template.objectives[i % template.objectives.length];
        const pillar = sortedPillars[i % Math.max(1, sortedPillars.length)];

        rows.push({
          workspace_id: currentWorkspace.id,
          title: `${CONTENT_FORMATS[format as ContentFormat]}${pillar ? `: ${pillar.name}` : ''}`,
          action_date: allowedDates[i],
          action_time: '09:00',
          action_type: 'content' as const,
          format,
          channel: 'Instagram',
          editorial_pillar_id: pillar?.id || null,
          objective,
          funnel_stage: objectiveToStage(objective),
          status: 'draft' as const,
          is_auto_generated: true,
          description: `Criado a partir do modelo ${template.name}`,
        });
      }

      if (rows.length === 0) {
        toast.error('Não foi possível gerar datas para a próxima semana.');
        return;
      }

      const result = await bulkCreateActions(rows);

      if (!result.ok) {
        toast.error('Erro ao aplicar modelo. Tente novamente.');
        return;
      }

      toast.success(`Modelo "${template.name}" aplicado! ${result.count} ações criadas como rascunho.`);
      setPreviewTemplate(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Modelos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Templates pré-configurados para acelerar o planejamento</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (
          <Card key={t.id}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                <LayoutTemplate className="w-5 h-5 text-primary-600" />
              </div>
              <Badge variant="primary">{t.segment}</Badge>
            </div>
            <h3 className="font-semibold text-gray-900">{t.name}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-3">{t.description}</p>
            <div className="flex items-center gap-2 mb-4">
              <Badge>{t.num_contents} conteúdos/semana</Badge>
              <Badge variant="info">{t.allowed_days.length} dias</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!currentWorkspace}
                onClick={() => setPreviewTemplate(t)}
              >
                Aplicar modelo
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {!currentWorkspace && (
        <Card padding="sm">
          <EmptyState icon={LayoutTemplate} title="Selecione um cliente" description="Escolha um workspace para aplicar modelos." />
        </Card>
      )}

      {/* Preview/Confirm modal */}
      <Modal isOpen={!!previewTemplate} onClose={() => setPreviewTemplate(null)} title={`Aplicar: ${previewTemplate?.name}`} size="lg">
        {previewTemplate && (
          <>
            <div className="space-y-3 mb-6">
              {Array.from({ length: previewTemplate.num_contents }).map((_, i) => {
                const format = previewTemplate.formats[i % previewTemplate.formats.length];
                const dayOffset = previewTemplate.allowed_days[i % previewTemplate.allowed_days.length];
                return (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{CONTENT_FORMATS[format as ContentFormat]}</p>
                      <p className="text-xs text-gray-500">Dia {dayOffset} da semana</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg mb-4">
              As ações serão criadas como <strong>rascunhos</strong> na próxima semana de {currentWorkspace?.name}. Nada será publicado automaticamente.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreviewTemplate(null)}>
                <X className="w-4 h-4" /> Cancelar
              </Button>
              <Button loading={applying} onClick={() => handleApply(previewTemplate)}>
                <Check className="w-4 h-4" /> Confirmar e aplicar
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
