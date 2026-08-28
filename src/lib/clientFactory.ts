import { supabase } from '@/lib/supabase';
import { MARKETING_PLAN_PILLARS } from '@/lib/editorialPillars';
import { normalizeFormatFrequency, formatFrequencyTotal } from '@/components/editorial/FormatFrequencyStepper';
import type { StrategicDateDraft } from '@/data/brDates';
import type { EnvironmentType, FormatFrequency, Workspace } from '@/types';

export interface CreateFullClientInput {
  environment: EnvironmentType;
  name: string;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  logo_url: string | null;
  format_frequency: FormatFrequency;
  google_calendar_id?: string;
  selectedDates?: StrategicDateDraft[];
}

export interface ClientUpdatePatch {
  name?: string;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  logo_url?: string | null;
}

/** Workspace com a organizacao do ambiente embutida (join de leitura). */
export type ClientWithOrg = Workspace & {
  organization: { environment: EnvironmentType; name: string } | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Cria um cliente completo em qualquer ambiente, sem UUID hardcoded:
 * organizacao resolvida dinamicamente pelo environment + workspace
 * (thread de chat criada por trigger) + 6 pilares padrão + perfil
 * editorial + integração Google Calendar opcional + datas estratégicas.
 */
export async function createFullClient(input: CreateFullClientInput): Promise<Workspace> {
  const name = input.name.trim();
  if (!name) throw new Error('Nome do cliente é obrigatório');

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('environment', input.environment)
    .maybeSingle();
  if (orgErr) throw new Error(`Erro ao buscar organização: ${orgErr.message}`);
  if (!org) throw new Error(`Organização ${input.environment} não encontrada`);

  const slugBase = slugify(name) || `cliente-${Date.now()}`;
  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      organization_id: org.id,
      name,
      slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
      segment: input.segment || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country,
      logo_url: input.logo_url,
    })
    .select('id, organization_id, name, slug, logo_url, segment, city, state, country, is_active, created_at, updated_at')
    .single();
  if (wsError || !ws) throw new Error(wsError?.message || 'Erro ao criar workspace');

  try {
    // 2. Pilares padrão da linha editorial
    const pillarRows = MARKETING_PLAN_PILLARS.map((p, i) => ({
      workspace_id: ws.id,
      name: p.name,
      description: p.description,
      color: p.color,
      percentage: p.percentage,
      sort_order: i + 1,
    }));
    const { data: pillarsInserted, error: pillarsError } = await supabase
      .from('editorial_pillars')
      .insert(pillarRows)
      .select('id, percentage');
    if (pillarsError) throw new Error(pillarsError.message);

    // 3. Perfil editorial (frequência + distribuição por pilar)
    const ff = normalizeFormatFrequency(input.format_frequency);
    const frequency = formatFrequencyTotal(ff);
    const distribution: Record<string, number> = {};
    pillarsInserted?.forEach(p => {
      distribution[p.id] = p.percentage;
    });
    const { error: profileError } = await supabase.from('editorial_profiles').insert({
      workspace_id: ws.id,
      frequency_per_week: frequency,
      format_frequency: ff,
      allowed_days: [1, 2, 3, 4, 5],
      preferred_times: ['09:00', '14:00', '18:00'],
      priority_formats: (ff.feed ?? 0) > 0
        ? ['static_post', 'carousel', 'photo', 'video', 'story', 'reels']
        : ['story', 'reels'],
      distribution,
      priority_objectives: ['educational', 'engagement'],
      priority_products: [],
      max_weekly: frequency + 2,
    });
    if (profileError) throw new Error(profileError.message);

    // 4. Google Calendar placeholder (opcional)
    const gcal = input.google_calendar_id?.trim();
    if (gcal) {
      const { error: gcalError } = await supabase.from('calendar_integrations').insert({
        workspace_id: ws.id,
        google_calendar_id: gcal,
        is_connected: false,
      });
      if (gcalError) throw new Error(gcalError.message);
    }

    // 5. Datas estratégicas detectadas no wizard
    if (input.selectedDates && input.selectedDates.length > 0) {
      const { error: datesError } = await supabase.from('strategic_dates').insert(
        input.selectedDates.map(d => ({
          workspace_id: ws.id,
          title: d.title,
          date: d.date,
          locality: d.locality,
          category: d.category,
          relevance: d.relevance,
          description: d.description,
          is_recurring: d.is_recurring,
        }))
      );
      if (datesError) throw new Error(datesError.message);
    }
  } catch (err) {
    // Compensa a criação parcial para não deixar cliente órfão ativo
    // (sem pilares/perfil) visível em fetchAllClients ou workspacesByEnv.
    await supabase.from('workspaces').update({ is_active: false }).eq('id', ws.id);
    throw err;
  }

  return ws;
}

export async function updateClient(id: string, patch: ClientUpdatePatch): Promise<void> {
  const { error } = await supabase.from('workspaces').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Desativa o cliente (soft delete — dados preservados). */
export async function deactivateClient(id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Todos os clientes ativos de todos os ambientes (guardião Oracullo). */
export async function fetchAllClients(): Promise<ClientWithOrg[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, organization_id, name, slug, logo_url, segment, city, state, country, is_active, created_at, updated_at, organization:organizations(environment, name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ClientWithOrg[];
}