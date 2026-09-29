// ==========================================
// crm-convert-lead
// Converte um lead em cliente (workspace) na org do ambiente:
// - valida lead (existe, do ambiente, ainda nao convertido)
// - cria workspace na organizacao do ambiente
// - marca lead stage='won' + workspace_id
// - registra atividade de conversao na timeline
//
// Permissao: guardiao OU staff do ambiente do lead (admin/team).
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ENVS = ['sharks_company', 'estrategos'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

interface LeadRow {
  id: string;
  environment: string;
  name: string;
  segment: string | null;
  workspace_id: string | null;
}

async function handleConvert(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return json(401, { error: 'Token invalido' });
  const callerId = userData.user.id;

  const body = await req.json().catch(() => null);
  const leadId: string = body?.lead_id ?? '';
  if (!UUID_RE.test(leadId)) return json(400, { error: 'lead_id (UUID) obrigatorio' });

  // 1. Lead existe?
  const { data: lead, error: leadErr } = await admin
    .from('crm_leads')
    .select('id, environment, name, segment, workspace_id')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) return json(500, { error: `Buscar lead: ${leadErr.message}` });
  if (!lead) return json(404, { error: 'Lead nao encontrado' });

  const leadRow = lead as LeadRow;
  if (!VALID_ENVS.includes(leadRow.environment as typeof VALID_ENVS[number])) {
    return json(400, { error: `Ambiente do lead invalido: ${leadRow.environment}` });
  }
  const env = leadRow.environment as typeof VALID_ENVS[number];

  // 2. Permissao: guardiao OU staff do ambiente do lead
  const { data: me } = await admin.from('users').select('is_guardian, role').eq('id', callerId).maybeSingle();
  const guardian = !!me?.is_guardian || me?.role === 'oracullo_admin';
  if (!guardian) {
    const { data: callerEnv } = await admin
      .from('user_environments')
      .select('role')
      .eq('user_id', callerId)
      .eq('environment', env)
      .maybeSingle();
    if (!callerEnv?.role || !['admin', 'team'].includes(callerEnv.role)) {
      return json(403, { error: `Apenas staff do ambiente ${env} pode converter leads` });
    }
  }

  // 3. Ja convertido?
  if (leadRow.workspace_id) {
    return json(400, { error: 'Lead ja foi convertido em cliente' });
  }

  // 4. Dados do cliente (payload tem prioridade; fallback: dados do lead)
  const wsName: string =
    typeof body?.workspace_name === 'string' && body.workspace_name.trim()
      ? body.workspace_name.trim()
      : leadRow.name;
  const segment: string | null =
    typeof body?.segment === 'string' && body.segment.trim()
      ? body.segment.trim()
      : leadRow.segment;

  // 5. Org do ambiente
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('environment', env)
    .maybeSingle();
  if (!org) return json(500, { error: `Organizacao do ambiente ${env} nao encontrada` });

  // 6. Cria o cliente (workspace)
  const slugBase = slugify(wsName) || `cliente-${Date.now()}`;
  const { data: ws, error: wsErr } = await admin
    .from('workspaces')
    .insert({
      organization_id: org.id,
      name: wsName,
      slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
      segment,
      is_active: true,
    })
    .select('id, name')
    .single();
  if (wsErr || !ws) return json(500, { error: `Criar cliente: ${wsErr?.message}` });

  // 7. Marca o lead como ganho e vincula o cliente
  const { error: upErr } = await admin
    .from('crm_leads')
    .update({ stage: 'won', workspace_id: ws.id, lost_reason: null })
    .eq('id', leadId);
  if (upErr) {
    // Rollback: nao deixa workspace orfao sem lead convertido
    await admin.from('workspaces').delete().eq('id', ws.id);
    return json(500, { error: `Atualizar lead: ${upErr.message}` });
  }

  // 8. Atividade de conversao na timeline
  const { error: actErr } = await admin.from('crm_lead_activities').insert({
    lead_id: leadId,
    user_id: callerId,
    type: 'system',
    content: `Lead convertido no cliente "${ws.name}".`,
  });
  if (actErr) console.warn('[crm-convert] atividade falhou (nao bloqueia):', actErr.message);

  return json(200, {
    ok: true,
    lead_id: leadId,
    workspace_id: ws.id,
    workspace_name: ws.name,
    environment: env,
  });
}

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });
    return await handleConvert(req);
  } catch (e) {
    console.error('[crm-convert] uncaught:', (e as Error)?.stack || e);
    return json(500, { error: `Erro interno: ${(e as Error)?.message || String(e)}` });
  }
});
