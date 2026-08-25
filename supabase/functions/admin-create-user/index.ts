import { serviceClient } from '../_shared/google.ts';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const VALID_ROLES = ['admin_sharks', 'sharks_team'];
const VALID_PERMISSIONS = ['calendar', 'campaigns', 'editorial', 'templates', 'history', 'chat', 'clients', 'integrations', 'team'];

const DEFAULT_PERMISSIONS = [
  { permission: 'calendar',     can_create: true,  can_read: true,  can_update: true,  can_delete: true },
  { permission: 'campaigns',    can_create: true,  can_read: true,  can_update: true,  can_delete: true },
  { permission: 'editorial',    can_create: true,  can_read: true,  can_update: true,  can_delete: true },
  { permission: 'templates',    can_create: true,  can_read: true,  can_update: true,  can_delete: true },
  { permission: 'history',      can_create: false, can_read: true,  can_update: false, can_delete: false },
  { permission: 'chat',         can_create: true,  can_read: true,  can_update: true,  can_delete: false },
  { permission: 'clients',      can_create: false, can_read: true,  can_update: false, can_delete: false },
  { permission: 'integrations', can_create: false, can_read: true,  can_update: false, can_delete: false },
  { permission: 'team',         can_create: false, can_read: true,  can_update: false, can_delete: false },
];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle();
  if (!caller || caller.role !== 'admin_sharks') {
    return json(403, { error: 'Apenas administradores podem criar usuarios' });
  }

  const body = await req.json().catch(() => null);
  if (!body) return json(400, { error: 'JSON invalido' });

  const { email, password, full_name, role, permissions, workspace_ids } = body;

  if (!email || !password || !full_name) {
    return json(400, { error: 'email, password e full_name sao obrigatorios' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return json(400, { error: 'Senha deve ter no minimo 6 caracteres' });
  }
  if (!VALID_ROLES.includes(role)) {
    return json(400, { error: `role invalido. Use: ${VALID_ROLES.join(', ')}` });
  }
  if (permissions) {
    for (const p of (Array.isArray(permissions) ? permissions : [])) {
      if (!p?.permission || !VALID_PERMISSIONS.includes(p.permission)) {
        return json(400, { error: `permission invalido: ${p?.permission}` });
      }
    }
  }

  // 1. Create auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (authError) return json(400, { error: authError.message });
  if (!authUser?.user) return json(500, { error: 'Falha ao criar usuario auth' });

  // 2. Create profile (rollback auth on failure)
  const { error: profileError } = await admin.from('users').insert({
    id: authUser.user.id,
    email: String(email).trim().toLowerCase(),
    full_name,
    role,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    return json(500, { error: `Perfil: ${profileError.message}` });
  }

  // 3. Create permissions (rollback everything on failure)
  const permsToInsert = (Array.isArray(permissions) && permissions.length > 0
    ? permissions
    : DEFAULT_PERMISSIONS
  ).map((p: Record<string, unknown>) => ({
    user_id: authUser.user.id,
    permission: p.permission,
    can_create: p.can_create ?? false,
    can_read: p.can_read ?? true,
    can_update: p.can_update ?? false,
    can_delete: p.can_delete ?? false,
  }));

  const { error: permsError } = await admin.from('team_member_access').insert(permsToInsert);
  if (permsError) {
    await admin.from('users').delete().eq('id', authUser.user.id).catch(() => {});
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    return json(500, { error: `Permissoes: ${permsError.message}` });
  }

  // 4. Client assignments (non-critical: report warning, don't rollback)
  let membershipsWarning: string | null = null;
  if (Array.isArray(workspace_ids) && workspace_ids.length > 0) {
    const memberships = workspace_ids.map((wsId: string) => ({
      user_id: authUser.user.id,
      workspace_id: wsId,
      role: 'manager' as const,
    }));
    const { error: memError } = await admin.from('memberships').upsert(memberships, { onConflict: 'user_id,workspace_id' });
    if (memError) membershipsWarning = `Clientes: ${memError.message}`;
  }

  return json(200, { ok: true, user_id: authUser.user.id, warning: membershipsWarning });
});
