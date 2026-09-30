/* ─── CRM: etapas fixas do funil (migration 064) ─── */
export type LeadStage = 'new' | 'contact' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const LEAD_STAGES: LeadStage[] = ['new', 'contact', 'proposal', 'negotiation', 'won', 'lost'];

export const STAGE_META: Record<LeadStage, { label: string; dotClass: string; badgeClass: string }> = {
  new:         { label: 'Novo',             dotClass: 'bg-gray-400',    badgeClass: 'bg-gray-100 text-gray-600' },
  contact:     { label: 'Em contato',       dotClass: 'bg-sky-500',     badgeClass: 'bg-sky-100 text-sky-700' },
  proposal:    { label: 'Proposta enviada', dotClass: 'bg-violet-500',  badgeClass: 'bg-violet-100 text-violet-700' },
  negotiation: { label: 'Negociação',       dotClass: 'bg-amber-500',   badgeClass: 'bg-amber-100 text-amber-700' },
  won:         { label: 'Ganho',            dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-700' },
  lost:        { label: 'Perdido',          dotClass: 'bg-red-400',     badgeClass: 'bg-red-100 text-red-600' },
};

export const ACTIVITY_TYPE_META: Record<string, { label: string }> = {
  note:            { label: 'Nota' },
  call:            { label: 'Ligação' },
  meeting:         { label: 'Reunião' },
  email:           { label: 'E-mail' },
  stage_change:    { label: 'Etapa' },
  system:          { label: 'Sistema' },
  outreach_draft:  { label: 'Rascunho de abordagem' },
  outreach_sent:   { label: 'Abordagem enviada' },
  reply_received:  { label: 'Resposta recebida' },
};

export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'há 1 dia';
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'há 1 mês';
  if (months < 12) return `há ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}
