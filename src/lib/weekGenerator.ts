import {
  GeneratedAction,
  WeekGeneratorResult,
  EditorialProfile,
  EditorialPillar,
  Action,
  StrategicDate,
  Campaign,
  ContentFormat,
  Objective,
  FunnelStage,
} from '@/types';
import { addDays, startOfWeek, format } from 'date-fns';
import { CONTENT_FORMATS, OBJECTIVES } from '@/lib/constants';

// ==========================================
// WEEK GENERATOR v2
// Cobertura de pilares, justificativas, times distribuídos,
// canais reais, inteligência de sinais recentes.
// ==========================================

interface GeneratorInput {
  profile: EditorialProfile;
  pillars: EditorialPillar[];
  existingActions: Action[];
  strategicDates: StrategicDate[];
  activeCampaigns: Campaign[];
  recentFormats: ContentFormat[];
  recentPillars: string[];
  recentObjectives: Objective[];
  channels: string[];
  weeksAhead?: number;      // default 1
}

// ---------- helpers ----------

function getWeekDates(start: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(start, i));
  return dates;
}

function dayLabel(d: Date): string {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];
}

function scoreItem<T extends string>(
  item: T,
  recent: T[],
  weight: number,
  randomJitter = 0.15,
): number {
  const recentCount = recent.filter(r => r === item).length;
  return 1 / (1 + recentCount * weight) * (1 + Math.random() * randomJitter);
}

function pickWeighted<T extends string>(
  available: T[],
  recent: T[],
  weight: number,
): T {
  if (available.length === 0) return '' as T;
  const scored = available.map(item => ({
    item,
    score: scoreItem(item, recent, weight),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].item;
}

// ---------- strategic date matching ----------

function findStrategic(dateStr: string, dates: StrategicDate[]): StrategicDate | undefined {
  return dates.find(d => d.date === dateStr);
}

function strategicTitlePrefix(sd: StrategicDate): string {
  if (sd.relevance === 'high') return `Aproveite a data: ${sd.title}`;
  return `${sd.title}`;
}

// ---------- campaign matching ----------

function findCampaign(dateStr: string, campaigns: Campaign[]): string | null {
  for (const c of campaigns) {
    if (c.start_date && c.end_date && dateStr >= c.start_date && dateStr <= c.end_date) return c.id;
  }
  return null;
}

// ---------- objective → funnel ----------

function getFunnelStage(objective: Objective): FunnelStage {
  const map: Partial<Record<Objective, FunnelStage>> = {
    brand_awareness: 'discovery',
    positioning: 'discovery',
    educational: 'interest',
    authority: 'interest',
    engagement: 'consideration',
    relationship: 'consideration',
    traffic: 'consideration',
    lead_conversion: 'conversion',
    sale_conversion: 'conversion',
    social_proof: 'consideration',
    launch: 'conversion',
    loyalty: 'relationship',
    repurchase: 'repurchase',
    retention: 'relationship',
    reactivation: 'repurchase',
  };
  return map[objective] || 'discovery';
}

// ---------- slot allocation (pillar % respect) ----------

interface SlotAllocation {
  dateStr: string;
  dayLabel: string;
  pillarId: string | null; // null = livre
  strategicDate?: StrategicDate;
  campaignId: string | null;
}

function allocateSlots(
  weekDates: Date[],
  allowedDays: number[],
  frequency: number,
  pillars: EditorialPillar[],
  distribution: Record<string, number>,
  strategicDates: StrategicDate[],
  activeCampaigns: Campaign[],
  existingActions: Action[],
  recentPillars: string[],
): SlotAllocation[] {
  const activePillars = pillars.filter(p => p.is_active);
  if (activePillars.length === 0) return [];

  // Days available (only allowed + weekend excluded)
  const availableDays = weekDates
    .filter(d => allowedDays.includes(d.getDay()))
    .slice(0, frequency);

  if (availableDays.length === 0) return [];

  // Compute pillar targets (how many slots per pillar)
  const totalTarget = availableDays.length;
  const pillarTargets: { id: string; name: string; target: number }[] = [];
  let assigned = 0;
  for (const p of activePillars) {
    const pct = distribution[p.id] ?? 15;
    const raw = (pct / 100) * totalTarget;
    const target = Math.max(1, Math.round(raw));
    assigned += target;
    pillarTargets.push({ id: p.id, name: p.name, target });
  }
  // Normalize if sum > totalTarget
  while (assigned > totalTarget && pillarTargets.length > 1) {
    const max = pillarTargets.reduce((a, b) => (a.target > b.target ? a : b));
    if (max.target > 1) { max.target--; assigned--; }
    else break;
  }

  // Build slots: one per day, assign pillar
  const existingByDate = new Map<string, boolean>();
  existingActions.forEach(a => {
    if (a.status !== 'cancelled') existingByDate.set(a.action_date, true);
  });

  // First pass: assign strategic dates and campaigns to their days
  const strategicMap = new Map<string, StrategicDate>();
  strategicDates.forEach(sd => strategicMap.set(sd.date, sd));
  const campaignMap = new Map<string, string | null>();
  activeCampaigns.forEach(c => {
    if (c.start_date && c.end_date) {
      for (const d of weekDates) {
        const ds = format(d, 'yyyy-MM-dd');
        if (ds >= c.start_date && ds <= c.end_date) campaignMap.set(ds, c.id);
      }
    }
  });

  const slots: SlotAllocation[] = [];
  for (const d of availableDays) {
    const ds = format(d, 'yyyy-MM-dd');
    const sd = strategicMap.get(ds);
    const cid = campaignMap.get(ds) ?? null;
    slots.push({ dateStr: ds, dayLabel: dayLabel(d), pillarId: null, strategicDate: sd, campaignId: cid });
  }

  // Fill pillar slots: first slots get the strategic-date pillar (or most under-represented)
  const pillarCounts = new Map<string, number>();
  activePillars.forEach(p => pillarCounts.set(p.id, 0));

  for (const slot of slots) {
    // Pick pillar: if strategic date → strongest available; else weighted random
    if (activePillars.length > 0) {
      const scored = activePillars.map(p => {
        const target = pillarTargets.find(pt => pt.id === p.id)?.target ?? 1;
        const count = pillarCounts.get(p.id) ?? 0;
        const deficit = target - count;
        return { pillar: p, score: deficit * 3 + scoreItem(p.id, recentPillars, 0.2) };
      });
      scored.sort((a, b) => b.score - a.score);
      slot.pillarId = scored[0].pillar.id;
      pillarCounts.set(scored[0].pillar.id, (pillarCounts.get(scored[0].pillar.id) ?? 0) + 1);
    }
  }

  return slots;
}

// ---------- title generation ----------

function generateTitle(
  format: ContentFormat,
  pillarName: string,
  objective: Objective,
  sd?: StrategicDate,
  channel?: string,
): string {
  const formatLabel = CONTENT_FORMATS[format] || format;
  const objectiveLabel = OBJECTIVES[objective] || objective;
  const ch = channel || 'Instagram';

  if (sd) {
    const prefix = strategicTitlePrefix(sd);
    return `${prefix} — ${formatLabel} ${ch}`;
  }

  const templates = [
    `${formatLabel}: ${pillarName} (${objectiveLabel})`,
    `${formatLabel} de ${pillarName} para ${ch}`,
    `${pillarName} — ${formatLabel}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ---------- main ----------

export function generateWeek(input: GeneratorInput): WeekGeneratorResult {
  const {
    profile,
    pillars,
    existingActions,
    strategicDates,
    activeCampaigns,
    recentFormats,
    recentPillars,
    recentObjectives,
    channels,
    weeksAhead = 1,
  } = input;

  const nextWeekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7 * weeksAhead);
  const weekDates = getWeekDates(nextWeekStart);

  const frequency = Math.min(profile.frequency_per_week, profile.max_weekly);
  const allowedDays = profile.allowed_days.length > 0 ? profile.allowed_days : [1, 2, 3, 4, 5];

  const trackingFormats = [...recentFormats];
  const trackingPillars = [...recentPillars];
  const trackingObjectives = [...recentObjectives];

  const slots = allocateSlots(
    weekDates, allowedDays, frequency, pillars, profile.distribution,
    strategicDates, activeCampaigns, existingActions, trackingPillars,
  );

  const generated: GeneratedAction[] = [];

  for (const slot of slots) {
    const pillar = pillars.find(p => p.id === slot.pillarId) || pillars[0];
    if (!pillar) continue;

    const selectedFormat = pickWeighted(
      (profile.priority_formats.length > 0 ? profile.priority_formats : ['reels', 'carousel', 'story']) as ContentFormat[],
      trackingFormats, 0.3,
    );
    const selectedObjective = pickWeighted(
      (profile.priority_objectives.length > 0 ? profile.priority_objectives : ['educational', 'engagement']) as Objective[],
      trackingObjectives, 0.25,
    );
    const funnelStage = getFunnelStage(selectedObjective);
    const channel = channels.length > 0
      ? channels[Math.floor(Math.random() * channels.length)]
      : 'Instagram';
    const timeIndex = Math.floor(Math.random() * Math.min(3, (profile.preferred_times?.length || 1)));
    const actionTime = profile.preferred_times?.[timeIndex] || '09:00';

    const reasons: string[] = [];
    if (slot.strategicDate) reasons.push(`Data estratégica: ${slot.strategicDate.title}`);
    if (slot.campaignId) reasons.push('Campanha ativa');
    if (trackingPillars.filter(p => p === pillar.id).length === 0) reasons.push('Pilar não usado recentemente');

    const title = generateTitle(selectedFormat, pillar.name, selectedObjective, slot.strategicDate, channel);

    generated.push({
      title,
      description: slot.strategicDate
        ? `Conteúdo para ${slot.strategicDate.title} (${slot.strategicDate.relevance})`
        : `Conteúdo automático — ${pillar.name}`,
      action_date: slot.dateStr,
      action_time: actionTime,
      action_type: 'content',
      format: selectedFormat,
      channel,
      editorial_pillar_id: pillar.id,
      objective: selectedObjective,
      funnel_stage: funnelStage,
      campaign_id: slot.campaignId,
      status: 'draft',
      reasons: reasons.length > 0 ? reasons : undefined,
    });

    trackingFormats.push(selectedFormat);
    trackingPillars.push(pillar.id);
    trackingObjectives.push(selectedObjective);
  }

  // Coverage stats
  const coverage: Record<string, { target: number; assigned: number; pct: number }> = {};
  const pillarCounts = new Map<string, number>();
  generated.forEach(g => pillarCounts.set(g.editorial_pillar_id, (pillarCounts.get(g.editorial_pillar_id) || 0) + 1));
  pillars.filter(p => p.is_active).forEach(p => {
    const target = Math.round(((profile.distribution[p.id] ?? 15) / 100) * generated.length) || 1;
    const assigned = pillarCounts.get(p.id) || 0;
    coverage[p.name] = { target, assigned, pct: Math.round((assigned / target) * 100) };
  });

  // Warnings
  const warnings: string[] = [];
  if (channels.length === 0) warnings.push('Nenhum canal configurado — canal padrão Instagram usado');
  if (pillars.filter(p => p.is_active).length === 0) warnings.push('Nenhum pilar ativo — revise os pilares editoriais');
  if (allowedDays.length === 0) warnings.push('Nenhum dia permitido — revise a configuração editorial');
  if (generated.length < frequency) warnings.push(`Geradas ${generated.length} de ${frequency} solicitadas (dias indisponíveis ou sem pilares)`);

  const weekLabel = `${format(weekDates[0], 'dd/MM')} - ${format(weekDates[6], 'dd/MM')}`;
  const summary = `${generated.length} ações geradas para ${weekLabel}`;

  return { actions: generated, summary, coverage, warnings };
}
