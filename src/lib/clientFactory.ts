import { supabase } from '@/lib/supabase';
import { MARKETING_PLAN_PILLARS } from '@/lib/editorialPillars';
import { normalizeFormatFrequency, formatFrequencyTotal } from '@/components/editorial/FormatFrequencyStepper';
import type { StrategicDateDraft } from '@/data/brDates';
import type { EnvironmentType, FormatFrequency, Workspace } from '@/types';

export interface CreateFullClientInput {
  environment?: EnvironmentType;
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

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cria UM cliente em UM ambiente (workspace + pilares + perfil editorial
 * + datas estrategicas + integracao Google opcional). O workspace nasce
 * INATIVO e so e ativado apos todas as gravacoes depententes terem sucesso.
 */
async function createClientInEnv(
  env: EnvironmentType,
  orgId: string,
  input: CreateFullClientInput,
): Promise<Workspace> {
  const name = input.name.trim();

  const slugBase = slugify(name) || `cliente-${Date.now()}`;
  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      organization_id: orgId,
      name,
      slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
      segment: input.segment || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country,
      logo_url: input.logo_url,
      is_active: false,
    })
    .select('id, organization_id, name, slug, logo_url, segment, city, state, country, is_active, created_at, updated_at')
    .single();
  if (wsError || !ws) throw new Error(wsError?.message || 'Erro ao criar workspace');

  // 2. Pilares padrao (o perfil depende dos ids -> vem antes)
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
  if (pillarsError) throw new Error(`Pilares: ${pillarsError.message}`);

  // 3-5. Perfil + Google Calendar + Datas estrategicas EM PARALELO
  const ff = normalizeFormatFrequency(input.format_frequency);
  const frequency = formatFrequencyTotal(ff);
  const distribution: Record<string, number> = {};
  pillarsInserted?.forEach(p => {
    distribution[p.id] = p.percentage;
  });

  const gcalPromise = input.google_calendar_id?.trim()
    ? supabase
        .from('calendar_integrations')
        .insert({ workspace_id: ws.id, google_calendar_id: input.google_calendar_id.trim(), is_connected: false })
        .select('id')
    : Promise.resolve({ data: null, error: null } as unknown as { data: unknown; error: null });

  const datesPromise = input.selectedDates && input.selectedDates.length > 0
    ? supabase
        .from('strategic_dates')
        .insert(
          input.selectedDates.map(d => ({
            workspace_id: ws.id,
            title: d.title,
            date: d.date,
            locality: d.locality,
            category: d.category,
            relevance: d.relevance,
            description: d.description,
            is_recurring: d.is_recurring,
          })),
        )
        .select('id')
    : Promise.resolve({ data: null, error: null } as unknown as { data: unknown; error: null });

  const [profileRes, gcalRes, datesRes] = await Promise.allSettled([
    supabase
      .from('editorial_profiles')
      .insert({
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
      })
      .select('id'),
    gcalPromise,
    datesPromise,
  ]);

  for (const r of [profileRes, gcalRes, datesRes]) {
    if (r.status === 'rejected') {
      throw new Error((r.reason as Error)?.message || 'Falha ao gravar dados do cliente');
    }
    const res = r.value as { error: { message: string } | null };
    if (res?.error) throw new Error(res.error.message);
  }

  // 6. Ativa so depois de tudo gravado; se falhar, permanece inativo.
  const { error: activateError } = await supabase
    .from('workspaces')
    .update({ is_active: true })
    .eq('id', ws.id)
    .select('id');
  if (activateError) throw new Error(activateError.message);
  ws.is_active = true;

  return ws as unknown as Workspace;
}

/**
 * Cria UM cliente em UM ambiente.
 */
export async function createFullClient(input: CreateFullClientInput): Promise<Workspace> {
  const name = input.name?.trim();
  if (!name) throw new Error('Nome do cliente é obrigatório');
  if (!input.environment) throw new Error('Ambiente é obrigatório');
  const created = await createFullClients([input.environment], input);
  return created[0];
}

/**
 * Cria o cliente em 1 OU MAIS ambientes (um workspace por ambiente),
 * com validacao anti-duplicado (mesmo nome normalizado na organizacao-alvo).
 * Cada ambiente e criado em paralelo; se um falhar, o outro permanece.
 */
export async function createFullClients(
  environments: EnvironmentType[],
  input: Omit<CreateFullClientInput, 'environment'>,
): Promise<Workspace[]> {
  const name = input.name?.trim();
  if (!name) throw new Error('Nome do cliente é obrigatório');
  const envs = [...new Set(environments)];
  if (envs.length === 0) throw new Error('Selecione pelo menos um ambiente');

  const { data: orgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('id, environment')
    .in('environment', envs);
  if (orgsErr) throw new Error(`Erro ao buscar organizações: ${orgsErr.message}`);

  const orgByEnv = new Map<string, string>();
  for (const o of (orgs ?? []) as Array<{ id: string; environment: string }>) {
    orgByEnv.set(o.environment, o.id);
  }
  const missing = envs.filter(e => !orgByEnv.has(e));
  if (missing.length > 0) {
    throw new Error(`Organização não encontrada para: ${missing.join(', ')}`);
  }

  // Anti-duplicado: mesmo nome (normalizado) ja existente na organizacao-alvo
  const { data: candidates } = await supabase
    .from('workspaces')
    .select('id, name, organization_id')
    .in('organization_id', [...new Set(orgByEnv.values())]);
  const dupEnvs = envs.filter(env =>
    (candidates ?? []).some(
      c => c.organization_id === orgByEnv.get(env) && normName(c.name ?? '') === normName(name),
    ),
  );
  if (dupEnvs.length > 0) {
    throw new Error(
      `Já existe um cliente com o nome "${name}" em: ${dupEnvs.map(e => e).join(', ')}. Escolha outro nome.`,
    );
  }

  const results = await Promise.allSettled(
    envs.map(env => createClientInEnv(env, orgByEnv.get(env)!, input)),
  );

  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { env: envs[i], msg: (r.reason as Error)?.message ?? 'erro' } : null))
    .filter(Boolean) as Array<{ env: string; msg: string }>;

  if (failures.length > 0) {
    const created = results
      .map((r, i) => (r.status === 'fulfilled' ? envs[i] : null))
      .filter(Boolean);
    throw new Error(
      `Falha ao criar em ${failures.map(f => f.env).join(', ')}: ${failures[0].msg}` +
        (created.length ? ` — criado com sucesso em: ${created.join(', ')}` : ''),
    );
  }

  return results.map(r => (r as PromiseFulfilledResult<Workspace>).value);
}

export async function updateClient(id: string, patch: ClientUpdatePatch): Promise<void> {
  const { error } = await supabase.from('workspaces').update(patch).eq('id', id).select('id');
  if (error) throw new Error(error.message);
}

/** Desativa o cliente (soft delete — dados preservados). */
export async function deactivateClient(id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').update({ is_active: false }).eq('id', id).select('id');
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
