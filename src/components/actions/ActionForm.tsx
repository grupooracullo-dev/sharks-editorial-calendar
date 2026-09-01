import { useState, useEffect } from 'react';
import { Action, ContentFormat, Objective, ActionType, ActionStatus, FunnelStage, EnvironmentType } from '@/types';
import Drawer from '@/components/ui/Drawer';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useActions } from '@/hooks/useActions';
import { useEditorial } from '@/hooks/useEditorial';
import { useActiveCampaigns } from '@/hooks/useCampaigns';
import { bulkCreateActions } from '@/lib/actionService';
import { supabase } from '@/lib/supabase';
import { formatCalendarDate, addDays, startOfWeek, parseISO } from '@/lib/dateUtils';
import { ACTION_TYPES, CONTENT_FORMATS, OBJECTIVES, FUNNEL_STAGES, ACTION_STATUSES, ACTION_TYPES_BY_ENV, FORM_SECTIONS_BY_ENV, DEFAULT_CHANNELS } from '@/lib/constants';
import { toast } from 'sonner';
import { CalendarDays } from 'lucide-react';

interface ActionFormProps {
  action: Action | null;
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  environment?: EnvironmentType;
}

export default function ActionForm({ action, isOpen, onClose, defaultDate, environment = 'sharks_company' }: ActionFormProps) {
  const { currentWorkspace, workspacesByEnv } = useWorkspace();
  // Apenas workspaces do ambiente do formulário (evita cross-env)
  const workspaces = workspacesByEnv(environment);
  const isEditing = !!action;
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState('basic');

  // Programação (nova ação apenas): repetir na semana/mês inteiro
  const [repeatMode, setRepeatMode] = useState<'day' | 'week' | 'month'>('day');
  const [skipWeekends, setSkipWeekends] = useState(false);

  /** Datas alvo conforme o modo de programação */
  const repeatDates = (): string[] => {
    if (!formData.action_date) return [];
    if (repeatMode === 'day') return [formData.action_date];
    const base = parseISO(formData.action_date + 'T00:00:00');
    if (repeatMode === 'week') {
      const start = startOfWeek(base, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => formatCalendarDate(addDays(start, i)));
    }
    // mês: dia 1 ao último dia do mês da data escolhida
    const y = base.getFullYear();
    const m = base.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const all = Array.from({ length: last }, (_, i) => formatCalendarDate(new Date(y, m, i + 1)));
    return skipWeekends
      ? all.filter(d => { const day = parseISO(d + 'T00:00:00').getDay(); return day !== 0 && day !== 6; })
      : all;
  };
  const repeatCount = isEditing ? 1 : Math.max(1, repeatDates().length);
  const isBulk = !isEditing && repeatMode !== 'day';

  const workspaceId = action?.workspace_id || currentWorkspace?.id || workspaces[0]?.id || '';
  const { pillars } = useEditorial(workspaceId);
  const campaigns = useActiveCampaigns(workspaceId);
  const { create, update, remove } = useActions({});

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workspace_id: workspaceId,
    action_date: new Date().toISOString().split('T')[0],
    action_time: '09:00',
    action_type: 'content' as ActionType,
    format: '' as string,
    channel: '',
    campaign_id: '' as string,
    editorial_pillar_id: '' as string,
    objective: '' as string,
    funnel_stage: '' as string,
    audience: '',
    product: '',
    theme: '',
    hook: '',
    main_message: '',
    copy_text: '',
    cta: '',
    status: 'draft' as ActionStatus,
    observations: '',
    responsible_ids: [] as string[],
    internal_deadline: '' as string,
  });

  // Time de Produção para o seletor de responsáveis — admins + equipe,
  // independente do cliente selecionado (mesma lista da página Time)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    supabase
      .from('users')
      .select('id, full_name')
      .in('role', ['admin_sharks', 'sharks_team'])
      .order('full_name')
      .then(({ data }) => {
        if (!active) return;
        const list = (data ?? []).map(u => ({ id: u.id, full_name: u.full_name }));
        // Preserva os responsáveis atuais (edição) mesmo se não estiverem na lista
        const current = action?.responsibles ?? [];
        if (current.length > 0) {
          for (const r of current) {
            if (!list.some(m => m.id === r.id)) {
              list.push({ id: r.id, full_name: r.full_name });
            }
          }
        } else if (action?.responsible_id && action?.responsible && !list.some(m => m.id === action.responsible_id)) {
          list.push({ id: action.responsible.id, full_name: action.responsible.full_name });
        }
        setTeamMembers(list);
      });
    return () => { active = false; };
  }, [isOpen, action?.responsibles, action?.responsible_id]);

  useEffect(() => {
    if (isOpen) {
      setRepeatMode('day');
      setSkipWeekends(false);
      if (action) {
        setFormData({
          title: action.title ?? '',
          description: action.description || '',
          workspace_id: action.workspace_id ?? workspaceId,
          action_date: action.action_date || defaultDate || new Date().toISOString().split('T')[0],
          action_time: action.action_time?.slice(0, 5) || '09:00',
          action_type: action.action_type || (environment === 'estrategos' ? 'meeting' : 'content') as ActionType,
          format: action.format || '',
          channel: action.channel || '',
          campaign_id: action.campaign_id || '',
          editorial_pillar_id: action.editorial_pillar_id || '',
          objective: action.objective || '',
          funnel_stage: action.funnel_stage || '',
          audience: action.audience || '',
          product: action.product || '',
          theme: action.theme || '',
          hook: action.hook || '',
          main_message: action.main_message || '',
          copy_text: action.copy_text || '',
          cta: action.cta || '',
          status: action.status || 'draft',
          observations: action.observations || '',
          responsible_ids: action.responsibles?.length
            ? action.responsibles.map(r => r.id)
            : (action.responsible_id ? [action.responsible_id] : []),
          internal_deadline: action.internal_deadline || '',
        });
      } else {
        setFormData({
          title: '',
          description: '',
          workspace_id: workspaceId,
          action_date: defaultDate || new Date().toISOString().split('T')[0],
          action_time: '09:00',
          action_type: environment === 'estrategos' ? 'meeting' : 'content',
          format: '',
          channel: '',
          campaign_id: '',
          editorial_pillar_id: '',
          objective: '',
          funnel_stage: '',
          audience: '',
          product: '',
          theme: '',
          hook: '',
          main_message: '',
          copy_text: '',
          cta: '',
          status: 'draft',
          observations: '',
          responsible_ids: [] as string[],
          internal_deadline: '',
        });
      }
    }
  }, [action, isOpen, defaultDate, workspaceId]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (asDraft = false) => {
    if (!(formData.title ?? '').trim()) return;

    setSaving(true);
    try {
      // ─── Programação (semana/mês): cria em lote ───
      if (isBulk) {
        const dates = repeatDates();
        if (dates.length === 0) {
          toast.error('Escolha uma data válida para programar');
          return;
        }
        const rows = dates.map(d => ({
          workspace_id: formData.workspace_id,
          environment: environment || 'sharks_company',
          title: formData.title,
          description: formData.description || null,
          action_date: d,
          action_time: formData.action_time || null,
          action_type: formData.action_type,
          format: (formData.format || null) as ContentFormat | null,
          channel: formData.channel || null,
          campaign_id: formData.campaign_id || null,
          editorial_pillar_id: formData.editorial_pillar_id || null,
          objective: (formData.objective || null) as Objective | null,
          funnel_stage: (formData.funnel_stage || null) as FunnelStage | null,
          audience: formData.audience || null,
          product: formData.product || null,
          theme: formData.theme || null,
          hook: formData.hook || null,
          main_message: formData.main_message || null,
          copy_text: formData.copy_text || null,
          cta: formData.cta || null,
          internal_deadline: formData.internal_deadline || null,
          status: (asDraft ? 'draft' : formData.status) as ActionStatus,
          observations: formData.observations || null,
          responsible_id: formData.responsible_ids[0] || null,
          responsible_ids: formData.responsible_ids,
          is_auto_generated: false,
        }));
        const result = await bulkCreateActions(rows);
        if (!result.ok) {
          toast.error(result.error || 'Erro ao criar as ações programadas');
          return;
        }
        toast.success(`${result.count} ações criadas${asDraft ? ' como rascunho' : ` com status "${ACTION_STATUSES[formData.status as ActionStatus]?.label ?? formData.status}"`}!`);
        onClose();
        return;
      }

      // ─── Ação única ───
      const payload = {
        ...formData,
        workspace_id: formData.workspace_id,
        environment: environment || 'sharks_company',
        format: (formData.format || null) as ContentFormat | null,
        objective: (formData.objective || null) as Objective | null,
        funnel_stage: (formData.funnel_stage || null) as FunnelStage | null,
        status: (asDraft ? 'draft' : formData.status) as ActionStatus,
        campaign_id: formData.campaign_id || null,
        editorial_pillar_id: formData.editorial_pillar_id || null,
        // Compatibilidade: responsável principal = 1º da lista
        responsible_id: formData.responsible_ids[0] || null,
        responsible_ids: formData.responsible_ids,
        internal_deadline: formData.internal_deadline || null,
      };

      const result = isEditing
        ? await update(action.id, payload)
        : await create(payload);

      if (!result.ok) {
        toast.error(result.error || 'Erro ao salvar ação');
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!action) return;
    setSaving(true);
    try {
      const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = action as Record<string, any>;
      const result = await create({
        ...payload,
        title: `${action.title} (cópia)`,
        status: 'draft' as ActionStatus,
      });
      if (!result.ok) {
        toast.error(result.error || 'Erro ao duplicar');
        return;
      }
      toast.success('Ação duplicada como rascunho');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const sections = FORM_SECTIONS_BY_ENV[environment] || FORM_SECTIONS_BY_ENV.sharks_company;
  const actionTypesForEnv = ACTION_TYPES_BY_ENV[environment] || ACTION_TYPES_BY_ENV.sharks_company;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Ação' : 'Nova Ação'} width="xl">
      <div className="space-y-6">
        {/* Section tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 px-2 py-2 text-xs font-medium rounded-md transition-all ${
                activeSection === s.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Basic Section */}
        {activeSection === 'basic' && (
          <div className="space-y-4">
            <Select
              label="Cliente"
              value={formData.workspace_id}
              onChange={(e) => handleChange('workspace_id', e.target.value)}
              options={[
                ...(currentWorkspace ? [{ value: currentWorkspace.id, label: currentWorkspace.name }] : []),
                ...workspaces.filter(w => w.id !== currentWorkspace?.id).map(w => ({ value: w.id, label: w.name })),
              ]}
            />
            <Input
              label="Título *"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Ex: Reels sobre novo produto"
            />
            <Textarea
              label="Descrição"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descreva a ação..."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Data"
                type="date"
                value={formData.action_date}
                onChange={(e) => handleChange('action_date', e.target.value)}
              />
              <Input
                label="Horário"
                type="time"
                value={formData.action_time}
                onChange={(e) => handleChange('action_time', e.target.value)}
              />
            </div>

            {/* Programação — repetir na semana/mês (nova ação apenas) */}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Programar <span className="text-gray-400 font-normal">(replicar a ação)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'day', label: 'Este dia' },
                    { id: 'week', label: 'Semana toda' },
                    { id: 'month', label: 'Mês todo' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRepeatMode(opt.id)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        repeatMode === opt.id
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {repeatMode !== 'day' && (
                  <div className="mt-2 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipWeekends}
                        onChange={(e) => setSkipWeekends(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-400"
                      />
                      Pular fins de semana (só dias úteis)
                    </label>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      Isso criará <strong className="text-gray-600">{repeatCount} ações</strong> — todas com o status
                      selecionado na aba Produção (Rascunho ou Programado).
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Tipo de Ação"
                value={formData.action_type}
                onChange={(e) => handleChange('action_type', e.target.value)}
                options={actionTypesForEnv.map(v => ({ value: v, label: ACTION_TYPES[v] }))}
              />
              <Select
                label="Status"
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                options={Object.entries(ACTION_STATUSES).map(([v, s]) => ({ value: v, label: s.label }))}
              />
            </div>
          </div>
        )}

        {/* Strategy Section (Sharks only) */}
        {activeSection === 'strategy' && environment === 'sharks_company' && (
          <div className="space-y-4">
            <Select
              label="Campanha"
              value={formData.campaign_id}
              onChange={(e) => handleChange('campaign_id', e.target.value)}
              placeholder="Nenhuma campanha"
              options={[
                { value: '', label: 'Nenhuma campanha' },
                ...campaigns.map(c => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              label="Pilar Editorial"
              value={formData.editorial_pillar_id}
              onChange={(e) => handleChange('editorial_pillar_id', e.target.value)}
              placeholder="Selecione um pilar"
              options={pillars.map(p => ({ value: p.id, label: p.name }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Objetivo"
                value={formData.objective}
                onChange={(e) => handleChange('objective', e.target.value)}
                placeholder="Selecione"
                options={Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: l }))}
              />
              <Select
                label="Etapa do Funil"
                value={formData.funnel_stage}
                onChange={(e) => handleChange('funnel_stage', e.target.value)}
                placeholder="Selecione"
                options={Object.entries(FUNNEL_STAGES).map(([v, l]) => ({ value: v, label: l }))}
              />
            </div>
            <Input
              label="Público"
              value={formData.audience}
              onChange={(e) => handleChange('audience', e.target.value)}
              placeholder="Ex: Mulheres 25-40 anos"
            />
            <Input
              label="Produto ou Serviço"
              value={formData.product}
              onChange={(e) => handleChange('product', e.target.value)}
              placeholder="Ex: Kit Dia dos Pais"
            />
          </div>
        )}

        {/* Content Section (Sharks only) */}
        {activeSection === 'content' && environment === 'sharks_company' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Formato"
                value={formData.format}
                onChange={(e) => handleChange('format', e.target.value)}
                placeholder="Selecione"
                options={Object.entries(CONTENT_FORMATS).map(([v, l]) => ({ value: v, label: l }))}
              />
              <Select
                label="Canal"
                value={formData.channel}
                onChange={(e) => handleChange('channel', e.target.value)}
                placeholder="Selecione"
                options={[
                  { value: '', label: 'Sem canal' },
                  ...DEFAULT_CHANNELS.map(c => ({ value: c.name, label: c.name })),
                  // Preserva canal legado não listado ao editar
                  ...(formData.channel && !DEFAULT_CHANNELS.some(c => c.name === formData.channel)
                    ? [{ value: formData.channel, label: `${formData.channel} (atual)` }]
                    : []),
                ]}
              />
            </div>
            <Input
              label="Tema"
              value={formData.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              placeholder="Ex: Dia dos Pais"
            />
            <Input
              label="Hook"
              value={formData.hook}
              onChange={(e) => handleChange('hook', e.target.value)}
              placeholder="Primeira frase que prende atenção"
            />
            <Textarea
              label="Mensagem Principal"
              value={formData.main_message}
              onChange={(e) => handleChange('main_message', e.target.value)}
              placeholder="Mensagem central do conteúdo"
            />
            <Textarea
              label="Copy"
              value={formData.copy_text}
              onChange={(e) => handleChange('copy_text', e.target.value)}
              placeholder="Texto completo da publicação"
              rows={5}
            />
            <Input
              label="CTA"
              value={formData.cta}
              onChange={(e) => handleChange('cta', e.target.value)}
              placeholder="Chamada para ação"
            />
          </div>
        )}

        {/* Planning Section (Estrategos only) */}
        {activeSection === 'planning' && environment === 'estrategos' && (
          <div className="space-y-4">
            <Input
              label="Projeto"
              value={formData.product}
              onChange={(e) => handleChange('product', e.target.value)}
              placeholder="Ex: Implantação ERP, Onboarding cliente"
            />
            <Input
              label="Participantes"
              value={formData.audience}
              onChange={(e) => handleChange('audience', e.target.value)}
              placeholder="Ex: João, Maria, Diretor Comercial"
            />
            <Input
              label="Tema / Assunto"
              value={formData.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              placeholder="Ex: Revisão trimestral, Apresentação de resultados"
            />
            <Textarea
              label="Pauta / Objetivo"
              value={formData.main_message}
              onChange={(e) => handleChange('main_message', e.target.value)}
              placeholder="O que precisa ser discutido ou decidido..."
            />
            <Textarea
              label="Notas"
              value={formData.copy_text}
              onChange={(e) => handleChange('copy_text', e.target.value)}
              placeholder="Anotações, decisões tomadas, próximos passos..."
              rows={5}
            />
          </div>
        )}

        {/* Production Section */}
        {activeSection === 'production' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Responsáveis <span className="text-gray-400 font-normal">(1 ou mais)</span>
              </label>
              {teamMembers.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-1">Nenhum membro do time disponível</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {teamMembers.map(m => {
                    const selected = formData.responsible_ids.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFormData(f => ({
                          ...f,
                          responsible_ids: selected
                            ? f.responsible_ids.filter(id => id !== m.id)
                            : [...f.responsible_ids, m.id],
                        }))}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                          selected
                            ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200 text-primary-700 font-medium'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          selected ? 'bg-primary-500 text-white' : 'border-2 border-gray-300'
                        }`}>
                          {selected && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-none stroke-current stroke-2"><path d="M2 6l3 3 5-5" /></svg>}
                        </div>
                        <span className="truncate">{m.full_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {formData.responsible_ids.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1.5">Sem responsável — a ação fica não atribuída</p>
              )}
            </div>
            <Input
              label="Prazo Interno"
              type="date"
              value={formData.internal_deadline}
              onChange={(e) => handleChange('internal_deadline', e.target.value)}
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
              options={Object.entries(ACTION_STATUSES).map(([v, s]) => ({ value: v, label: s.label }))}
            />
            <Textarea
              label="Observações"
              value={formData.observations}
              onChange={(e) => handleChange('observations', e.target.value)}
              placeholder="Observações internas..."
            />
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-2 sticky bottom-0 bg-white">
          <Button onClick={() => handleSave(false)} loading={saving} disabled={!(formData.title ?? '').trim()}>
            {isBulk ? `Criar ${repeatCount} ações` : 'Salvar ação'}
          </Button>
          {!isEditing && (
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={!(formData.title ?? '').trim()}>
              {isBulk ? `Rascunho (${repeatCount})` : 'Salvar como rascunho'}
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" onClick={handleDuplicate} disabled={saving}>
                Duplicar
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Excluir
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose} className="ml-auto">
            Cancelar
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir Ação" size="sm">
        <p className="text-sm text-gray-600">
          Tem certeza que deseja excluir a ação <strong>"{action?.title}"</strong>?
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button
            variant="danger"
            loading={deleting}
            onClick={async () => {
              if (!action) return;
              setDeleting(true);
              const result = await remove(action.id);
              setDeleting(false);
              setConfirmDelete(false);
              if (typeof result === 'object') {
                if (result.ok) {
                  toast.success('Ação excluída com sucesso!');
                  onClose();
                } else {
                  toast.error(`Erro ao excluir: ${result.error || 'tente novamente'}`);
                }
              } else {
                toast.success('Ação excluída com sucesso!');
                onClose();
              }
            }}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </Drawer>
  );
}
