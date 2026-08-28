import {
  GeneratedAction,
  WeekGeneratorResult,
  EditorialProfile,
  EditorialPillar,
  Action,
  StrategicDate,
  Campaign,
  ContentFormat,
  FormatFrequencyZone,
  Objective,
  FunnelStage,
} from '@/types';
import { addDays, startOfWeek, format } from 'date-fns';
import { CONTENT_FORMATS, OBJECTIVES, FORMAT_ZONES } from '@/lib/constants';

// ==========================================
// WEEK GENERATOR v3
// Multi-slot por dia, títulos contextuais,
// meses estratégicos, anti-repetição avançada.
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
  weeksAhead?: number;      // default 1 (ignorado se weekStart informada)
  weekStart?: Date;         // data de referência da semana a gerar
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

function findStrategicForDate(dateStr: string, dates: StrategicDate[]): StrategicDate | undefined {
  // Busca exata (data pontual)
  const exact = dates.find(d => d.date === dateStr && !d.start_date);
  if (exact) return exact;

  // Busca por período (start_date <= dateStr <= end_date)
  const period = dates.find(d => {
    if (!d.start_date || !d.end_date) return false;
    return dateStr >= d.start_date && dateStr <= d.end_date;
  });
  return period;
}

function strategicTitlePrefix(sd: StrategicDate): string {
  // Período mensal: usa o nome do mês
  if (sd.start_date && sd.end_date) {
    return `Conteúdo ${sd.title}`;
  }
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

// ---------- contextual title templates ----------

type TimeSlot = 'morning' | 'afternoon' | 'evening';

function getTimeSlot(time: string): TimeSlot {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const GREETING_TEMPLATES: Record<TimeSlot, string[]> = {
  morning: [
    'Bom Dia',
    'Bom Dia Institucional',
    'Dica do Dia',
    'Bom Dia com',
    'Comece o Dia com',
  ],
  afternoon: [
    'Boa Tarde',
    'Saiba Mais',
    'Curiosidade do Dia',
    'Boa Tarde com',
    'Conteúdo do Dia',
  ],
  evening: [
    'Boa Noite',
    'Reflexão do Dia',
    'Resumo do Dia',
    'Boa Noite com',
    'Encerramento do Dia',
  ],
};

const PILLAR_THEMES: Record<string, string[]> = {
  'Essência da Marca': ['valores', 'propósito', 'identidade', 'cultura', 'missão'],
  'Geomarketing': ['região', 'local', 'presença', 'comunidade', 'território'],
  'Público Alvo e Persona': ['persona', 'público', 'segmento', 'perfil', 'audiência'],
  'Posicionamento': ['diferencial', 'posição', 'valor', 'percepção', 'mindshare'],
  'Branding': ['marca', 'reconhecimento', 'imagem', 'consistência', 'visual'],
  'Objetivo de Marketing': ['meta', 'resultado', 'conversão', 'crescimento', 'performance'],
};

function generateContextualTitle(
  format: ContentFormat,
  pillarName: string,
  objective: Objective,
  time: string,
  sd?: StrategicDate,
  channel?: string,
): string {
  const formatLabel = CONTENT_FORMATS[format] || format;
  const ch = channel || 'Instagram';
  const timeSlot = getTimeSlot(time);

  // Data estratégica (pontual ou período)
  if (sd) {
    const prefix = strategicTitlePrefix(sd);
    const templates = [
      `${prefix} — ${formatLabel}`,
      `${prefix} para ${ch}`,
      `${prefix} — ${pillarName}`,
      `${prefix}: ${formatLabel} ${ch}`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Título contextual baseado no horário + pilar
  const greetings = GREETING_TEMPLATES[timeSlot];
  const themes = PILLAR_THEMES[pillarName] || ['conteúdo'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const theme = themes[Math.floor(Math.random() * themes.length)];

  const templates = [
    `${greeting} — ${pillarName}`,
    `${greeting}: ${formatLabel} sobre ${theme}`,
    `${greeting} com ${pillarName}`,
    `${formatLabel} de ${pillarName} para ${ch}`,
    `${pillarName} — ${formatLabel} ${ch}`,
    `${theme.charAt(0).toUpperCase() + theme.slice(1)}: ${formatLabel} ${pillarName}`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

// ---------- slot allocation (multi-slot per day) ----------

interface SlotAllocation {
  dateStr: string;
  dayLabel: string;
  time: string;
  pillarId: string | null;
  strategicDate?: StrategicDate;
  campaignId: string | null;
}

function allocateSlots(
  weekDates: Date[],
  allowedDays: number[],
  totalFrequency: number,
  pillars: EditorialPillar[],
  distribution: Record<string, number>,
  strategicDates: StrategicDate[],
  activeCampaigns: Campaign[],
  preferredTimes: string[],
): SlotAllocation[] {
  const activePillars = pillars.filter(p => p.is_active);
  if (activePillars.length === 0) return [];

  // Dias disponíveis na semana
  const availableDays = weekDates.filter(d => allowedDays.includes(d.getDay()));
  if (availableDays.length === 0) return [];

  // Slots por dia = total / dias disponíveis (mínimo 1)
  const slotsPerDay = Math.max(1, Math.ceil(totalFrequency / availableDays.length));

  // Horários: expandir preferred_times para cobrir todos os slots
  const times = preferredTimes.length > 0
    ? preferredTimes
    : ['09:00', '11:00', '14:00', '16:00', '18:00'];

  // Mapa de datas estratégicas
  const strategicMap = new Map<string, StrategicDate>();
  strategicDates.forEach(sd => {
    if (sd.start_date && sd.end_date) {
      // Período: marca todos os dias do período
      let current = new Date(sd.start_date + 'T00:00:00Z');
      const end = new Date(sd.end_date + 'T00:00:00Z');
      while (current <= end) {
        const ds = format(current, 'yyyy-MM-dd');
        strategicMap.set(ds, sd);
        current = addDays(current, 1);
      }
    } else {
      strategicMap.set(sd.date, sd);
    }
  });

  // Mapa de campanhas
  const campaignMap = new Map<string, string | null>();
  activeCampaigns.forEach(c => {
    if (c.start_date && c.end_date) {
      let current = new Date(c.start_date + 'T00:00:00Z');
      const end = new Date(c.end_date + 'T00:00:00Z');
      while (current <= end) {
        const ds = format(current, 'yyyy-MM-dd');
        campaignMap.set(ds, c.id);
        current = addDays(current, 1);
      }
    }
  });

  // Distribuir targets dos pillars
  const totalTarget = Math.min(totalFrequency, availableDays.length * slotsPerDay);
  const pillarTargets: { id: string; name: string; target: number }[] = [];
  let assigned = 0;
  for (const p of activePillars) {
    const pct = distribution[p.id] ?? 15;
    const raw = (pct / 100) * totalTarget;
    const target = Math.max(1, Math.round(raw));
    assigned += target;
    pillarTargets.push({ id: p.id, name: p.name, target });
  }
  // Normalizar se somar > total
  while (assigned > totalTarget && pillarTargets.length > 1) {
    const max = pillarTargets.reduce((a, b) => (a.target > b.target ? a : b));
    if (max.target > 1) { max.target--; assigned--; }
    else break;
  }

  // Criar slots
  const slots: SlotAllocation[] = [];
  const pillarCounts = new Map<string, number>();
  activePillars.forEach(p => pillarCounts.set(p.id, 0));

  for (const d of availableDays) {
    const ds = format(d, 'yyyy-MM-dd');
    const sd = strategicMap.get(ds);
    const cid = campaignMap.get(ds) ?? null;

    for (let s = 0; s < slotsPerDay && slots.length < totalTarget; s++) {
      const time = times[s % times.length];

      // Atribuir pilar: preferir pilar com mais déficit
      let pillarId: string | null = null;
      if (activePillars.length > 0) {
        const scored = activePillars.map(p => {
          const target = pillarTargets.find(pt => pt.id === p.id)?.target ?? 1;
          const count = pillarCounts.get(p.id) ?? 0;
          const deficit = target - count;
          return { pillar: p, score: deficit * 3 + Math.random() * 0.5 };
        });
        scored.sort((a, b) => b.score - a.score);
        pillarId = scored[0].pillar.id;
        pillarCounts.set(scored[0].pillar.id, (pillarCounts.get(scored[0].pillar.id) ?? 0) + 1);
      }

      slots.push({
        dateStr: ds,
        dayLabel: dayLabel(d),
        time,
        pillarId,
        strategicDate: sd,
        campaignId: cid,
      });
    }
  }

  return slots;
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
    weekStart,
  } = input;

  const nextWeekStart = weekStart
    ? startOfWeek(weekStart, { weekStartsOn: 1 })
    : addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7 * weeksAhead);
  const weekDates = getWeekDates(nextWeekStart);

  const totalFrequency = Math.min(profile.frequency_per_week, profile.max_weekly || profile.frequency_per_week + 2);
  const allowedDays = profile.allowed_days.length > 0 ? profile.allowed_days : [1, 2, 3, 4, 5];

  const trackingFormats = [...recentFormats];
  const trackingPillars = [...recentPillars];
  const trackingObjectives = [...recentObjectives];

  const slots = allocateSlots(
    weekDates, allowedDays, totalFrequency, pillars, profile.distribution,
    strategicDates, activeCampaigns, profile.preferred_times,
  );

  // Monta fila de zonas baseada em format_frequency
  const ff = profile.format_frequency;
  const ffActive = ff && Object.keys(ff).length > 0
    ? (Object.entries(ff) as [string, number][]).filter(([, n]) => (n ?? 0) > 0)
    : null;
  let zoneQueue: string[] | null = null;
  if (ffActive && ffActive.length > 0 && slots.length > 0) {
    const base: string[] = [];
    ffActive.forEach(([z, n]) => { for (let k = 0; k < n; k++) base.push(z); });
    // Embaralha para evitar sequências
    for (let i = base.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    zoneQueue = Array.from({ length: slots.length }, (_, i) => base[i % base.length]);
  }

  const generated: GeneratedAction[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const pillar = pillars.find(p => p.id === slot.pillarId) || pillars[0];
    if (!pillar) continue;

    // Selecionar formato
    const selectedFormat = (() => {
      if (zoneQueue) {
        const zone = zoneQueue[i] as FormatFrequencyZone;
        const pool = FORMAT_ZONES[zone] ?? [zone] as ContentFormat[];
        // Anti-repetição: evitar mesmo formato nos últimos 3
        const recent = trackingFormats.slice(-3);
        const fresh = pool.filter(f => !recent.includes(f));
        const list = fresh.length > 0 ? fresh : pool;
        return list[Math.floor(Math.random() * list.length)];
      }
      return pickWeighted(
        (profile.priority_formats.length > 0 ? profile.priority_formats : ['reels', 'carousel', 'story']) as ContentFormat[],
        trackingFormats, 0.3,
      );
    })();

    // Selecionar objetivo
    const selectedObjective = pickWeighted(
      (profile.priority_objectives.length > 0 ? profile.priority_objectives : ['educational', 'engagement']) as Objective[],
      trackingObjectives, 0.25,
    );
    const funnelStage = getFunnelStage(selectedObjective);

    // Canal
    const channel = channels.length > 0
      ? channels[Math.floor(Math.random() * channels.length)]
      : 'Instagram';

    // Título contextual
    const title = generateContextualTitle(
      selectedFormat, pillar.name, selectedObjective, slot.time,
      slot.strategicDate, channel,
    );

    // Justificativas
    const reasons: string[] = [];
    if (slot.strategicDate) reasons.push(`Data estratégica: ${slot.strategicDate.title}`);
    if (slot.campaignId) reasons.push('Campanha ativa');
    if (trackingPillars.filter(p => p === pillar.id).length === 0) reasons.push('Pilar não usado recentemente');

    generated.push({
      title,
      description: slot.strategicDate
        ? `Conteúdo para ${slot.strategicDate.title} (${slot.strategicDate.relevance})`
        : `Conteúdo automático — ${pillar.name}`,
      action_date: slot.dateStr,
      action_time: slot.time,
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
  if (generated.length < totalFrequency) warnings.push(`Geradas ${generated.length} de ${totalFrequency} solicitadas (dias indisponíveis ou sem pilares)`);

  const weekLabel = `${format(weekDates[0], 'dd/MM')} - ${format(weekDates[6], 'dd/MM')}`;
  const summary = `${generated.length} ações geradas para ${weekLabel}`;

  return { actions: generated, summary, coverage, warnings };
}
