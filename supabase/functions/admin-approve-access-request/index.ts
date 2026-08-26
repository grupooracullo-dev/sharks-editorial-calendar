import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// admin_sharks intencionalmente ausente: concessão de admin
// continua exclusiva da página Time (decisão de segurança).
const GRANTABLE_ROLES = ['client', 'sharks_team'] as const;
type GrantableRole = typeof GRANTABLE_ROLES[number];

// Deve espelhar PERMISSION_META em src/lib/permissions.ts
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

interface PermissionInput {
  permission: string;
  can_create?: boolean;
  can_read?: boolean;
  can_update?: boolean;
  can_delete?: boolean;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

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

  const { data: caller } = await admin.from('users').select('role').eq('id', userData.user.id).maybeSingle();
  if (!caller || caller.role !== 'admin_sharks') {
    return json(403, { error: 'Apenas administradores podem aprovar acessos' });
  }

  const body = await req.json().catch(() => null);
  if (!body?.request_id || !UUID_RE.test(body.request_id)) {
    return json(400, { error: 'request_id (UUID) obrigatorio' });
  }

  const { request_id } = body;

  // 1. Fetch the request
  const { data: reqRow, error: reqErr } = await admin
    .from('access_requests')
    .select('*')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !reqRow) return json(404, { error: 'Solicitacao nao encontrada' });
  if (reqRow.status !== 'pending') return json(400, { error: `Solicitacao ja foi ${reqRow.status}` });

  // 2. Resolve granted role (admin decision overrides requested_role)
  let role: GrantableRole;
  if (body.role !== undefined) {
    if (!GRANTABLE_ROLES.includes(body.role)) {
      return json(400, { error: `role invalido. Use: ${GRANTABLE_ROLES.join(', ')} (admin_sharks somente via pagina Time)` });
    }
    role = body.role;
  } else {
    // Backward-compatible fallback: clientes solicitam 'client';
    // se o solicitante pediu sharks_team, honra o pedido.
    role = reqRow.requested_role === 'sharks_team' ? 'sharks_team' : 'client';
  }

  const fullName = (typeof body.full_name === 'string' && body.full_name.trim())
    ? body.full_name.trim()
    : reqRow.full_name;

  // 3. Resolve workspaces per role
  let clientWorkspaceId: string | null = null;
  if (role === 'client') {
    const candidate = (typeof body.workspace_id === 'string' && UUID_RE.test(body.workspace_id))
      ? body.workspace_id
      : reqRow.workspace_id;
    if (candidate) {
      const { data: ws } = await admin.from('workspaces').select('id').eq('id', candidate).maybeSingle();
      if (!ws) return json(400, { error: 'Cliente (workspace) selecionado nao existe' });
      clientWorkspaceId = candidate;
    }
  }

  let teamWorkspaceIds: string[] = [];
  if (role === 'sharks_team' && Array.isArray(body.workspace_ids)) {
    teamWorkspaceIds = [...new Set(
      body.workspace_ids.filter((w: unknown) => typeof w === 'string' && UUID_RE.test(w as string)),
    )];
    if (teamWorkspaceIds.length > 0) {
      const { data: wsRows } = await admin.from('workspaces').select('id').in('id', teamWorkspaceIds);
      if (!wsRows || wsRows.length !== teamWorkspaceIds.length) {
        return json(400, { error: 'Um ou mais clientes atribuidos nao existem' });
      }
    }
  }

  // 4. Resolve permissions matrix (team only)
  let permissions: PermissionInput[] = DEFAULT_PERMISSIONS;
  if (role === 'sharks_team' && Array.isArray(body.permissions) && body.permissions.length > 0) {
    for (const p of body.permissions) {
      if (!p?.permission || !VALID_PERMISSIONS.includes(p.permission)) {
        return json(400, { error: `permission invalido: ${p?.permission}` });
      }
    }
    permissions = body.permissions;
  }

  // 5. Does an auth user already exist for this email?
  //    (Google-first flow: user signed in with Google BEFORE approval)
  const { data: existingAuthId, error: rpcErr } = await admin
    .rpc('admin_find_auth_user_by_email', { p_email: reqRow.email });

  if (rpcErr) return json(500, { error: `Lookup auth: ${rpcErr.message}` });

  let userId: string;
  let tempPassword: string | null = null;
  let authProvider: 'google' | 'password';

  if (existingAuthId) {
    // ---- Google-first: attach profile/membership to the existing identity.
    // No password is generated — the user already authenticates via Google.
    userId = existingAuthId;
    authProvider = 'google';

    const { data: existingProfile } = await admin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      return json(400, { error: 'Este e-mail ja possui conta completa no sistema. Verifique o usuario ou rejeite a solicitacao.' });
    }

    // Pull the name from Google metadata when the provided name is empty
    const resolvedName = fullName
      || (await admin.auth.admin.getUserById(userId)).data?.user?.user_metadata?.full_name
      || reqRow.email;

    const { error: profileErr } = await admin.from('users').insert({
      id: userId,
      email: reqRow.email,
      full_name: resolvedName,
      role,
    });
    if (profileErr) return json(500, { error: `Perfil: ${profileErr.message}` });
  } else {
    // ---- Classic flow: no auth user yet — create one with a temp password.
    authProvider = 'password';
    tempPassword = generateTempPassword();

    const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
      email: reqRow.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createErr || !authUser?.user) {
      return json(500, { error: `Falha ao criar auth: ${createErr?.message}` });
    }
    userId = authUser.user.id;

    const { error: profileErr } = await admin.from('users').insert({
      id: userId,
      email: reqRow.email,
      full_name: fullName,
      role,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: `Perfil: ${profileErr.message}` });
    }
  }

  // 6. Team permissions (rollback everything on failure)
  if (role === 'sharks_team') {
    const permsToInsert = permissions.map((p) => ({
      user_id: userId,
      permission: p.permission,
      can_create: p.can_create ?? false,
      can_read: p.can_read ?? true,
      can_update: p.can_update ?? false,
      can_delete: p.can_delete ?? false,
    }));

    const { error: permsError } = await admin.from('team_member_access').insert(permsToInsert);
    if (permsError) {
      await admin.from('users').delete().eq('id', userId).catch(() => {});
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: `Permissoes: ${permsError.message}` });
    }
  }

  // 7. Memberships: client -> 'member' no workspace escolhido;
  //    team -> 'manager' nos clientes atribuidos.
  let membershipsWarning: string | null = null;
  if (role === 'client' && clientWorkspaceId) {
    const { error: memErr } = await admin.from('memberships').upsert(
      { user_id: userId, workspace_id: clientWorkspaceId, role: 'member' },
      { onConflict: 'user_id,workspace_id' },
    );
    if (memErr) membershipsWarning = `Cliente: ${memErr.message}`;
  }
  if (role === 'sharks_team' && teamWorkspaceIds.length > 0) {
    const rows = teamWorkspaceIds.map((wsId) => ({
      user_id: userId,
      workspace_id: wsId,
      role: 'manager' as const,
    }));
    const { error: memErr } = await admin.from('memberships').upsert(rows, { onConflict: 'user_id,workspace_id' });
    if (memErr) membershipsWarning = `Clientes: ${memErr.message}`;
  }

  // 8. Mark the request approved (granted_role = papel efetivamente concedido)
  const { error: updErr } = await admin
    .from('access_requests')
    .update({
      status: 'approved',
      granted_role: role,
      temp_password: tempPassword, // null for Google-first
      auth_provider: authProvider === 'google' ? 'google' : null,
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
    .eq('id', request_id);

  if (updErr) console.warn('[approve] update warning:', updErr.message);

  return json(200, {
    ok: true,
    user_id: userId,
    role,
    auth_provider: authProvider,
    temp_password: tempPassword,
    email: reqRow.email,
    warning: membershipsWarning,
  });
});
