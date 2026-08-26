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
import { supabase } from '@/lib/supabase';
import { ACTION_TYPES, CONTENT_FORMATS, OBJECTIVES, FUNNEL_STAGES, ACTION_STATUSES, ACTION_TYPES_BY_ENV, FORM_SECTIONS_BY_ENV } from '@/lib/constants';
import { toast } from 'sonner';

interface ActionFormProps {
  action: Action | null;
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  environment?: EnvironmentType;
}

export default function ActionForm({ action, isOpen, onClose, defaultDate, environment = 'sharks_company' }: ActionFormProps) {
  const { currentWorkspace, workspaces } = useWorkspace();
  const isEditing = !!action;
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState('basic');

  const workspaceId = action?.workspace_id || currentWorkspace?.id || workspaces[0]?.id || '';
  const { pillars } = useEditorial(workspaceId);
  const campaigns = useActiveCampaigns(workspaceId);
  const { create, update, remove } = useActions({});

  // Team members (admin + sharks_team) for responsible selector
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('users')
      .select('id, full_name')
      .in('role', ['admin_sharks', 'sharks_team'])
      .order('full_name')
      .then(({ data }) => {
        if (data) setTeamMembers(data as Array<{ id: string; full_name: string }>);
      });
  }, [isOpen]);

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
    responsible_id: '' as string,
    internal_deadline: '' as string,
  });

  useEffect(() => {
    if (isOpen) {
      if (action) {
        setFormData({
          title: action.title,
          description: action.description || '',
          workspace_id: action.workspace_id,
          action_date: action.action_date,
          action_time: action.action_time?.slice(0, 5) || '09:00',
          action_type: action.action_type,
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
          status: action.status,
          observations: action.observations || '',
          responsible_id: (action as any).responsible_id || '',
          internal_deadline: (action as any).internal_deadline || '',
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
          responsible_id: '',
          internal_deadline: '',
        });
      }
    }
  }, [action, isOpen, defaultDate, workspaceId]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (asDraft = false) => {
    if (!formData.title.trim()) return;

    setSaving(true);
    try {
      const payload = {
        ...formData,
        workspace_id: formData.workspace_id,
        format: (formData.format || null) as ContentFormat | null,
        objective: (formData.objective || null) as Objective | null,
        funnel_stage: (formData.funnel_stage || null) as FunnelStage | null,
        status: (asDraft ? 'draft' : formData.status) as ActionStatus,
        campaign_id: formData.campaign_id || null,
        editorial_pillar_id: formData.editorial_pillar_id || null,
        responsible_id: formData.responsible_id || null,
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
              <Input
                label="Canal"
                value={formData.channel}
                onChange={(e) => handleChange('channel', e.target.value)}
                placeholder="Ex: Instagram"
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
            <Select
              label="Responsável"
              value={formData.responsible_id}
              onChange={(e) => handleChange('responsible_id', e.target.value)}
              placeholder="Selecione um responsável"
              options={[
                { value: '', label: 'Sem responsável' },
                ...teamMembers.map(m => ({ value: m.id, label: m.full_name })),
              ]}
            />
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
          <Button onClick={() => handleSave(false)} loading={saving} disabled={!formData.title.trim()}>
            Salvar ação
          </Button>
          {!isEditing && (
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={!formData.title.trim()}>
              Salvar como rascunho
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
