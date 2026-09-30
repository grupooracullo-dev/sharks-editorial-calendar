import { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  Search, FileSearch, Target, Send, MessageSquare, CalendarCheck,
  Radar, Loader2, Bot, ShieldCheck, Cpu, Clock, Settings, Save,
} from 'lucide-react';
import {
  useProspectingJobs, useAgentSettings, type AgentSettings,
} from '@/hooks/useProspecting';
import { JOB_TYPE_META, JOB_STATUS_META, type JobStatus, type ProspectingEnvironment } from '@/lib/prospecting/types';
import type { LucideIcon } from 'lucide-react';

interface AgentPageProps {
  environment: ProspectingEnvironment;
  editable?: boolean;
}

/* Pipeline do agente — a ordem do fluxo §39 do plano */
const FLOW_STEPS: Array<{ icon: LucideIcon; label: string; phase: string }> = [
  { icon: Search, label: 'Discovery', phase: 'F2' },
  { icon: FileSearch, label: 'Pesquisa', phase: 'F2' },
  { icon: Target, label: 'Qualificação', phase: 'F3' },
  { icon: Send, label: 'Abordagem', phase: 'F4' },
  { icon: MessageSquare, label: 'Resposta', phase: 'F4' },
  { icon: CalendarCheck, label: 'Agendamento', phase: 'F5' },
];

const AGENTS: Array<{ icon: LucideIcon; name: string; description: string; phase: string }> = [
  { icon: Search,       name: 'Discovery Agent',      description: 'Encontra empresas que casam com o ICP da campanha.', phase: 'F2' },
  { icon: FileSearch,   name: 'Research Agent',       description: 'Pesquisa e enriquece dados das empresas descobertas.', phase: 'F2' },
  { icon: Target,       name: 'Qualification Agent',  description: 'Score de oportunidade e recomendação de produtos.', phase: 'F3' },
  { icon: Send,         name: 'Outreach Agent',       description: 'Gera mensagens personalizadas para revisão.', phase: 'F4' },
  { icon: MessageSquare, name: 'Conversation Agent',  description: 'Interpreta respostas e atualiza o CRM.', phase: 'F4' },
  { icon: CalendarCheck, name: 'Scheduling Agent',    description: 'Agenda reuniões usando a agenda existente.', phase: 'F5' },
];

const JOB_STATUS_ICON: Record<JobStatus, LucideIcon> = {
  pending: Clock,
  processing: Cpu,
  completed: ShieldCheck,
  failed: Bot,
  retry: Clock,
};

export default function AgentSection({ environment, editable = false }: AgentPageProps) {
  const jobs = useProspectingJobs(environment);
  const { user } = useAuth();
  const { settings, loading: settingsLoading, saveSettings } = useAgentSettings(environment);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<AgentSettings | null>(null);

  useEffect(() => {
    if (!settingsLoading) setSettingsForm(settings);
  }, [settings, settingsLoading]);

  const setP = (key: keyof AgentSettings['params'], value: string | number) =>
    setSettingsForm(f => (f ? { ...f, params: { ...f.params, [key]: typeof value === 'number' ? value : Number(value) } } : f));
  const setPer = (key: keyof AgentSettings['personality'], value: string) =>
    setSettingsForm(f => (f ? { ...f, personality: { ...f.personality, [key]: value } } : f));

  const handleSaveSettings = async () => {
    if (!settingsForm) return;
    setSavingSettings(true);
    try {
      await saveSettings(settingsForm, user?.id ?? null);
      toast.success('Personalidade e parâmetros salvos! Valem para as próximas execuções.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configurações');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-y-auto pb-2">

      {/* Status do motor */}
      <Card padding="md" className="flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
          <Radar className="w-5 h-5 text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Motor de prospecção — fundação ativa</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Estrutura de dados, fila e permissões operando. A execução automática (discovery, IA e abordagem)
            é ativada nas próximas fases, respeitando o nível de automação de cada campanha.
          </p>
        </div>
        <Badge variant="info" size="sm">Modo: fundação</Badge>
      </Card>

      {/* Pipeline do agente */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Fluxo do agente</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {FLOW_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-center gap-1 min-w-[86px]">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <step.icon className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-[11px] font-medium text-gray-600">{step.label}</span>
                <Badge variant="default" size="sm">{step.phase}</Badge>
              </div>
              {i < FLOW_STEPS.length - 1 && <span className="w-6 h-px bg-gray-200 mb-5" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Agentes especializados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {AGENTS.map(agent => (
          <Card key={agent.name} padding="md" className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <agent.icon className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
                <Badge variant="default" size="sm">{agent.phase}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Garantias */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Garantias de operação</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>· Toda ação do agente é registrada na timeline do lead no CRM.</li>
          <li>· Nenhuma abordagem real é executada sem revisão no nível <strong>Assistido</strong>.</li>
          <li>· Campanhas Sharks e Estrategos são isoladas por ambiente (RLS).</li>
          <li>· Integrações externas (e-mail, WhatsApp) passam obrigatoriamente pela validação do backend.</li>
        </ul>
      </Card>

      {/* Personalidade & Parâmetros */}
      <Card padding="md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </span>
            Personalidade & Parâmetros
          </CardTitle>
          {!editable && <span className="text-[11px] text-gray-400">Somente admin edita</span>}
        </CardHeader>
        {settingsForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Nome do agente" value={settingsForm.personality.agent_name} onChange={(e) => setPer('agent_name', e.target.value)} disabled={!editable} />
              <Select
                label="Tom de voz"
                value={settingsForm.personality.tone}
                onChange={(e) => setPer('tone', e.target.value)}
                options={[
                  { value: 'amigavel', label: 'Amigável' },
                  { value: 'formal', label: 'Formal' },
                  { value: 'direto', label: 'Direto' },
                ]}
                disabled={!editable}
              />
              <Input
                label="Assinatura"
                value={settingsForm.personality.signature}
                onChange={(e) => setPer('signature', e.target.value)}
                disabled={!editable}
              />
            </div>
            <Textarea
              label="Persona (como o agente se apresenta)"
              value={settingsForm.personality.persona}
              onChange={(e) => setPer('persona', e.target.value)}
              placeholder="Ex.: Consultora comercial prática, focada em resultado do cliente..."
              rows={2}
              disabled={!editable}
            />
            <Textarea
              label="Regras de voz (o que o agente pode/não pode dizer)"
              value={settingsForm.personality.brand_voice_rules}
              onChange={(e) => setPer('brand_voice_rules', e.target.value)}
              placeholder="Ex.: nunca prometer resultado garantido; frases curtas; 1 pergunta por mensagem..."
              rows={2}
              disabled={!editable}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input
                label="Rascunho auto (fit ≥)"
                type="number" min="0" max="1" step="0.05"
                value={settingsForm.params.fit_draft_threshold}
                onChange={(e) => setP('fit_draft_threshold', e.target.value)}
                disabled={!editable}
              />
              <Input
                label="Descartar (fit <)"
                type="number" min="0" max="1" step="0.05"
                value={settingsForm.params.fit_discard_threshold}
                onChange={(e) => setP('fit_discard_threshold', e.target.value)}
                disabled={!editable}
              />
              <Input
                label="Confiança p/ agir"
                type="number" min="0" max="1" step="0.05"
                value={settingsForm.params.confidence_auto}
                onChange={(e) => setP('confidence_auto', e.target.value)}
                disabled={!editable}
              />
              <Input
                label="Empresas/execução"
                type="number" min="1" max="20"
                value={settingsForm.params.max_companies_per_run}
                onChange={(e) => setP('max_companies_per_run', e.target.value)}
                disabled={!editable}
              />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-gray-400">
                Valores valem para as próximas execuções do agente neste ambiente.
              </p>
              {editable && (
                <Button size="sm" onClick={handleSaveSettings} loading={savingSettings}>
                  <Save className="w-3.5 h-3.5" />
                  Salvar configurações
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Atividade recente (jobs) */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Atividade recente</h3>
          <span className="text-xs text-gray-400">{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
        </div>
        {jobs.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Nenhuma execução ainda"
            description="O agente começa a registrar atividades quando a primeira campanha entrar em execução (F2)."
          />
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const status = JOB_STATUS_META[job.status];
              const StatusIcon = JOB_STATUS_ICON[job.status];
              return (
                <div key={job.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                  <StatusIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">
                      {JOB_TYPE_META[job.type].label}
                      {job.campaign?.name && <span className="text-gray-400"> · {job.campaign.name}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(job.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      {job.attempts > 1 && ` · tentativa ${job.attempts}`}
                    </p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0', status.badgeClass)}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
