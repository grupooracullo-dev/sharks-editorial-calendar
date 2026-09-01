// ==========================================
// admin-move-client-env
// Move um cliente (workspace) de ambiente alterando a organização.
//
// - Apenas guardião Oracullo.
// - Recusa se houver dados de Estrategos (projetos/reuniões/implementações)
//   e o destino for Sharks (referências órfãs).
// - Retorna contagem de dados afetados para o resumo na UI.
// ==========================================

import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ENVS = ['sharks_company', 'estrategos'] as const;

Deno.serve(async req => {
  Object.assign(CORS, corsHeaders(req));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const { data: me } = await admin.from('users').select('is_guardian, role').eq('id', userData.user.id).maybeSingle();
  const guardian = !!me?.is_guardian || me?.role === 'oracullo_admin';
  if (!guardian) return json(403, { error: 'Apenas o guardiao Oracullo pode mover clientes entre ambientes' });

  const body = await req.json().catch(() => null);
  const workspaceId: string = body?.workspace_id ?? '';
  const targetEnv: string = body?.target_environment ?? '';

  if (!UUID_RE.test(workspaceId)) return json(400, { error: 'workspace_id (UUID) obrigatorio' });
  if (!VALID_ENVS.includes(targetEnv as typeof VALID_ENVS[number])) {
    return json(400, { error: `target_environment invalido. Use: ${VALID_ENVS.join(', ')}` });
  }

  const { data: ws } = await admin
    .from('workspaces')
    .select('id, name, organization_id, is_active')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!ws) return json(404, { error: 'Cliente nao encontrado' });

  const { data: currentOrg } = await admin.from('organizations').select('id, environment').eq('id', ws.organization_id).maybeSingle();
  if (!currentOrg) return json(500, { error: 'Organizacao atual nao encontrada' });
  if (currentOrg.environment === targetEnv) return json(400, { error: `O cliente ja esta no ambiente ${targetEnv}` });

  const { data: targetOrg } = await admin.from('organizations').select('id').eq('environment', targetEnv).maybeSingle();
  if (!targetOrg) return json(500, { error: `Organizacao do ambiente ${targetEnv} nao encontrada` });

  // Dados de Estrategos impedem saida para Sharks (referencias ficariam orfas)
  if (targetEnv === 'sharks_company') {
    const [proj, meet, impl] = await Promise.all([
      admin.from('estrategos_projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      admin.from('estrategos_meetings').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      admin.from('estrategos_implementations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);
    const estrategosRows = (proj.count ?? 0) + (meet.count ?? 0) + (impl.count ?? 0);
    if (estrategosRows > 0) {
      return json(400, { error: `Este cliente possui ${estrategosRows} registro(s) de projetos/reunioes/implementacoes do Estrategos — archive ou remova antes de mover.` });
    }
  }

  // Contagem para o resumo da operacao
  const [actions, campaigns, threads, dates, integrations] = await Promise.all([
    admin.from('actions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('campaigns').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('chat_threads').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('strategic_dates').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    admin.from('calendar_integrations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
  ]);

  const { data: moved, error: moveErr } = await admin
    .from('workspaces')
    .update({ organization_id: targetOrg.id })
    .eq('id', workspaceId)
    .eq('organization_id', currentOrg.id)
    .select('id')
    .maybeSingle();

  if (moveErr || !moved) {
    return json(500, { error: moveErr ? `Falha ao mover: ${moveErr.message}` : 'Falha ao mover cliente' });
  }

  return json(200, {
    ok: true,
    moved: true,
    workspace_id: workspaceId,
    name: ws.name,
    from: currentOrg.environment,
    to: targetEnv,
    counts: {
      actions: actions.count ?? 0,
      campaigns: campaigns.count ?? 0,
      chat_threads: threads.count ?? 0,
      strategic_dates: dates.count ?? 0,
      calendar_integrations: integrations.count ?? 0,
    },
  });
});
