/* ─── Prospecção IA — domínio (migration 067) ─── */

export type ProspectingEnvironment = 'sharks_company' | 'estrategos';

/* Status da campanha */
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'running', 'paused', 'completed', 'failed'];
export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; badgeClass: string }> = {
  draft:     { label: 'Rascunho',    badgeClass: 'bg-gray-100 text-gray-600' },
  running:   { label: 'Em execução', badgeClass: 'bg-emerald-100 text-emerald-700' },
  paused:    { label: 'Pausada',     badgeClass: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Concluída',   badgeClass: 'bg-sky-100 text-sky-700' },
  failed:    { label: 'Falhou',      badgeClass: 'bg-red-100 text-red-600' },
};

/* Tipos e estados de job (fila do Prospecting Engine) */
export type JobType =
  | 'discover_companies'
  | 'enrich_company'
  | 'analyze_company'
  | 'score_company'
  | 'generate_message'
  | 'send_message'
  | 'follow_up';
export const JOB_TYPES: JobType[] = [
  'discover_companies', 'enrich_company', 'analyze_company', 'score_company',
  'generate_message', 'send_message', 'follow_up',
];

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
export const JOB_STATUSES: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'retry'];

/* Estado de prospecção — separado do estágio comercial (crm_leads.stage) */
export type ProspectingStatus =
  | 'discovered'
  | 'researching'
  | 'qualified'
  | 'discarded'
  | 'queued'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'converted_to_pipeline';
export const PROSPECTING_STATUSES: ProspectingStatus[] = [
  'discovered', 'researching', 'qualified', 'discarded', 'queued',
  'contacted', 'replied', 'interested', 'converted_to_pipeline',
];
export const PROSPECTING_STATUS_META: Record<ProspectingStatus, { label: string }> = {
  discovered:            { label: 'Descoberto' },
  researching:           { label: 'Em pesquisa' },
  qualified:             { label: 'Qualificado' },
  discarded:             { label: 'Descartado' },
  queued:                { label: 'Na fila' },
  contacted:             { label: 'Contatado' },
  replied:               { label: 'Respondeu' },
  interested:            { label: 'Interessado' },
  converted_to_pipeline: { label: 'No pipeline' },
};

/* Canais de abordagem (preparados para e-mail, WhatsApp, Instagram e voz) */
export const PROSPECTING_CHANNELS = ['email', 'whatsapp', 'instagram', 'voice'] as const;
export type ProspectingChannel = typeof PROSPECTING_CHANNELS[number];
export const CHANNEL_META: Record<ProspectingChannel, { label: string }> = {
  email:     { label: 'E-mail' },
  whatsapp:  { label: 'WhatsApp' },
  instagram: { label: 'Instagram' },
  voice:     { label: 'Voz' },
};

/* Nível de automação (o MVP nunca executa abordagens reais automaticamente) */
export const AUTOMATION_LEVELS = ['assisted', 'semi_auto', 'auto'] as const;
export type AutomationLevel = typeof AUTOMATION_LEVELS[number];
export const AUTOMATION_META: Record<AutomationLevel, { label: string }> = {
  assisted:  { label: 'Assistido' },
  semi_auto: { label: 'Semi-automático' },
  auto:      { label: 'Automático' },
};

export const COMPANY_SIZES = ['Micro', 'Pequeno', 'Médio', 'Grande'] as const;

/* ─── Entidades ─── */
export interface ProspectingCampaign {
  id: string;
  environment: ProspectingEnvironment;
  name: string;
  objective: string | null;
  segment: string | null;
  location: string | null;
  company_size: string | null;
  target_count: number;
  channels: string[];
  automation_level: AutomationLevel;
  status: CampaignStatus;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  products: Array<{ product: { id: string; name: string } }> | null;
  assigned_to_user?: { id: string; full_name: string; avatar_url: string | null } | null;
}

export interface ProspectingJob {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  type: JobType;
  status: JobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  dedupe_key: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPayload {
  name: string;
  objective: string | null;
  segment: string | null;
  location: string | null;
  company_size: string | null;
  target_count: number;
  channels: string[];
  automation_level: AutomationLevel;
  assigned_to: string | null;
  product_ids?: string[];
  status?: CampaignStatus;
}
