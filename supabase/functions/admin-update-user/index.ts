import { serviceClient, corsHeaders } from '../_shared/google.ts';

// Per-request CORS (updated at handler start)
let CORS: Record<string, string> = {};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const VALID_ROLES = ['admin_sharks', 'sharks_team'];
const VALID_ENVS = ['sharks_company', 'estrategos'];
const VALID_PERMISSIONS = ['calendar', 'campaigns', 'editorial', 'templates', 'history', 'chat', 'clients', 'integrations', 'team'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const body = await req.json().catch(() => null);
  if (!body) return json(400, { error: 'JSON invalido' });

  const { user_id, full_name, role, permissions, workspace_ids } = body;
  // Escopo por ambiente: admin global sharks so gerencia sharks_company;
  // admin do ambiente estrategos gerencia estrategos. Memberships sao
  // editadas SOMENTE dentro do ambiente (nao apaga vinculos do outro).
  const environment: string = VALID_ENVS.includes(body?.environment) ? body.environment : 'sharks_company';

  const { data: caller } = await admin.from('users').select('role, is_guardian').eq('id', userData.user.id).maybeSingle();
  const guardian = !!caller?.is_guardian || caller?.role === 'oracullo_admin';
  let isEnvAdmin = false;
  if (!guardian) {
    const { data: callerEnvs } = await admin
      .from('user_environments')
      .select('environment, role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin');
    isEnvAdmin = (callerEnvs ?? []).some((e: { environment: string }) => e.environment === environment);
  }
  const allowed =
    guardian ||
    isEnvAdmin ||
    (environment === 'sharks_company' && caller?.role === 'admin_sharks');
  if (!allowed) {
    return json(403, { error: `Apenas guardiao ou admin do ambiente ${environment} pode editar membros dele` });
  }

  if (!user_id || !UUID_RE.test(user_id)) return json(400, { error: 'user_id (UUID) obrigatorio' });
  if (role && !VALID_ROLES.includes(role)) {
    return json(400, { error: `role invalido. Use: ${VALID_ROLES.join(', ')}` });
  }
  if (permissions && !Array.isArray(permissions)) {
    return json(400, { error: 'permissions deve ser array' });
  }
  if (permissions) {
    for (const p of permissions) {
      if (!p.permission || !VALID_PERMISSIONS.includes(p.permission)) {
        return json(400, { error: `permission invalido: ${p.permission}` });
      }
      for (const k of ['can_create', 'can_read', 'can_update', 'can_delete']) {
        if (p[k] !== undefined && typeof p[k] !== 'boolean') {
          return json(400, { error: `${k} deve ser boolean em ${p.permission}` });
        }
      }
    }
  }
  if (workspace_ids && !Array.isArray(workspace_ids)) {
    return json(400, { error: 'workspace_ids deve ser array' });
  }

  // 1. Update profile
  if (full_name || role) {
    const update: Record<string, string> = {};
    if (full_name) update.full_name = String(full_name).slice(0, 200);
    if (role) update.role = role;

    const { error } = await admin.from('users').update(update).eq('id', user_id);
    if (error) return json(500, { error: `Perfil: ${error.message}` });
  }

  // 2. Update permissions (replace all)
  if (permissions) {
    const { error: delError } = await admin.from('team_member_access').delete().eq('user_id', user_id);
    if (delError) return json(500, { error: `Limpar permissoes: ${delError.message}` });

    const permsToInsert = permissions.map((p: Record<string, unknown>) => ({
      user_id,
      permission: p.permission,
      can_create: p.can_create ?? false,
      can_read: p.can_read ?? true,
      can_update: p.can_update ?? false,
      can_delete: p.can_delete ?? false,
    }));

    if (permsToInsert.length > 0) {
      const { error: insError } = await admin.from('team_member_access').insert(permsToInsert);
      if (insError) return json(500, { error: `Inserir permissoes: ${insError.message}` });
    }
  }

  // 3. Update client assignments — scoped ao ambiente:
  //    substitui APENAS as memberships manager de workspaces da org
  //    deste ambiente (preserva vinculos do outro ambiente).
  const scopeEnv = async (): Promise<Set<string> | null> => {
    const { data: org } = await admin.from('organizations').select('id').eq('environment', environment).maybeSingle();
    if (!org) return null;
    const { data: envWs } = await admin.from('workspaces').select('id').eq('organization_id', org.id);
    return new Set((envWs ?? []).map((w: { id: string }) => w.id));
  };

  if (workspace_ids) {
    const envWsIds = await scopeEnv();
    if (!envWsIds) return json(500, { error: `Organizacao do ambiente ${environment} nao encontrada` });

    const invalid = workspace_ids.filter((id: string) => !envWsIds.has(id));
    if (invalid.length > 0) {
      return json(400, { error: `Um ou mais clientes nao pertencem ao ambiente ${environment}` });
    }

    const { error: delError } = await admin
      .from('memberships')
      .delete()
      .eq('user_id', user_id)
      .eq('role', 'manager')
      .in('workspace_id', [...envWsIds]);
    if (delError) return json(500, { error: `Limpar clientes: ${delError.message}` });

    if (workspace_ids.length > 0) {
      const memberships = workspace_ids.map((wsId: string) => ({
        user_id,
        workspace_id: wsId,
        role: 'manager' as const,
      }));
      const { error: insError } = await admin.from('memberships').upsert(memberships, { onConflict: 'user_id,workspace_id' });
      if (insError) return json(500, { error: `Atribuir clientes: ${insError.message}` });
    }
  }

  return json(200, { ok: true, environment });
});
