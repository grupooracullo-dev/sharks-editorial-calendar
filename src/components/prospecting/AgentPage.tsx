import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import {
  Search, FileSearch, Target, Send, MessageSquare, CalendarCheck,
  Radar, Loader2, Bot, ShieldCheck, Cpu, Clock,
} from 'lucide-react';
import { useProspectingJobs } from '@/hooks/useProspecting';
import { JOB_TYPE_META, JOB_STATUS_META, type JobStatus, type ProspectingEnvironment } from '@/lib/prospecting/types';
import type { LucideIcon } from 'lucide-react';

interface AgentPageProps {
  environment: ProspectingEnvironment;
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

export default function AgentPage({ environment }: AgentPageProps) {
  const jobs = useProspectingJobs(environment);

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-y-auto pb-2">
      <PageHeader
        title="Agente de Prospecção IA"
        subtitle="O motor que descobre, pesquisa, qualifica e aborda prospects — com transparência total no CRM."
      />

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
