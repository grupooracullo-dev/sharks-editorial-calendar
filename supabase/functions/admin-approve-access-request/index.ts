import { serviceClient, corsHeaders } from '../_shared/google.ts';
import { sendEmail, approvedAccessEmail } from '../_shared/email.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GRANTABLE_ROLES = ['client', 'sharks_team'] as const;
type GrantableRole = typeof GRANTABLE_ROLES[number];

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

// Mapeamento ambiente → organization_id
const ENV_ORG_MAP: Record<string, string> = {
  sharks_company: '00000000-0000-0000-0000-000000000001',
  estrategos: '00000000-0000-0000-0000-000000000002',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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

  const { data: caller } = await admin.from('users').select('role, is_guardian').eq('id', userData.user.id).maybeSingle();
  const isGuardian = !!caller?.is_guardian || caller?.role === 'oracullo_admin';

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

  // 2. Resolve granted role
  let role: GrantableRole;
  if (body.role !== undefined) {
    if (!GRANTABLE_ROLES.includes(body.role)) {
      return json(400, { error: `role invalido. Use: ${GRANTABLE_ROLES.join(', ')}` });
    }
    role = body.role;
  } else {
    role = reqRow.requested_role === 'sharks_team' ? 'sharks_team' : 'client';
  }

  const fullName = (typeof body.full_name === 'string' && body.full_name.trim())
    ? body.full_name.trim()
    : reqRow.full_name;

  // 3. Resolve environments (admin override ou solicitacao)
  let environments: string[] = [];
  if (Array.isArray(body.requested_environments) && body.requested_environments.length > 0) {
    environments = body.requested_environments.filter((e: string) => ENV_ORG_MAP[e]);
  } else if (Array.isArray(reqRow.requested_environments) && reqRow.requested_environments.length > 0) {
    environments = reqRow.requested_environments.filter((e: string) => ENV_ORG_MAP[e]);
  } else if (reqRow.requested_environment && ENV_ORG_MAP[reqRow.requested_environment]) {
    environments = [reqRow.requested_environment];
  } else {
    environments = ['sharks_company'];
  }

  // 3.1 Permissão POR AMBIENTE: caller deve ser guardião OU admin de CADA env concedido
  if (!isGuardian) {
    const { data: callerEnvs } = await admin
      .from('user_environments')
      .select('environment, role')
      .eq('user_id', userData.user.id);
    const adminEnvs = new Set(
      (callerEnvs ?? []).filter(e => e.role === 'admin').map(e => e.environment),
    );
    const missing = environments.filter(e => !adminEnvs.has(e));
    if (missing.length > 0) {
      return json(403, { error: `Sem permissao de admin nos ambientes: ${missing.join(', ')}` });
    }
  }

  // 4. Resolve workspaces per role
  // Orgs dos ambientes concedidos — usado para validar pertencimento
  // (server-side: a UI filtra, mas a API nao podia confiar nisso).
  const { data: grantedOrgs } = await admin
    .from('organizations')
    .select('id, environment')
    .in('environment', environments);
  const grantedOrgIds = new Set((grantedOrgs ?? []).map(o => o.id));

  let clientWorkspaceId: string | null = null;
  if (role === 'client') {
    const candidate = (typeof body.workspace_id === 'string' && UUID_RE.test(body.workspace_id))
      ? body.workspace_id
      : reqRow.workspace_id;
    if (candidate) {
      const { data: ws } = await admin.from('workspaces').select('id, organization_id').eq('id', candidate).maybeSingle();
      if (!ws) return json(400, { error: 'Cliente (workspace) selecionado nao existe' });
      if (!grantedOrgIds.has(ws.organization_id)) {
        return json(400, { error: 'O cliente selecionado nao pertence aos ambientes concedidos' });
      }
      clientWorkspaceId = candidate;
    }
  }

  let teamWorkspaceIds: string[] = [];
  if (role === 'sharks_team' && Array.isArray(body.workspace_ids)) {
    teamWorkspaceIds = [...new Set(
      body.workspace_ids.filter((w: unknown) => typeof w === 'string' && UUID_RE.test(w as string)),
    )];
    if (teamWorkspaceIds.length > 0) {
      const { data: wsRows } = await admin.from('workspaces').select('id, organization_id').in('id', teamWorkspaceIds);
      if (!wsRows || wsRows.length !== teamWorkspaceIds.length) {
        return json(400, { error: 'Um ou mais clientes atribuidos nao existem' });
      }
      if (wsRows.some(w => !grantedOrgIds.has(w.organization_id))) {
        return json(400, { error: 'Um ou mais clientes atribuidos nao pertencem aos ambientes concedidos' });
      }
    }
  }

  // 5. Resolve permissions matrix (team only)
  let permissions: PermissionInput[] = DEFAULT_PERMISSIONS;
  if (role === 'sharks_team' && Array.isArray(body.permissions) && body.permissions.length > 0) {
    for (const p of body.permissions) {
      if (!p?.permission || !VALID_PERMISSIONS.includes(p.permission)) {
        return json(400, { error: `permission invalido: ${p?.permission}` });
      }
    }
    permissions = body.permissions;
  }

  // 6. Does an auth user already exist?
  const { data: existingAuthId, error: rpcErr } = await admin
    .rpc('admin_find_auth_user_by_email', { p_email: reqRow.email });

  if (rpcErr) return json(500, { error: `Lookup auth: ${rpcErr.message}` });

  let userId: string;
  let tempPassword: string | null = null;
  let authProvider: 'google' | 'password';

  if (existingAuthId) {
    userId = existingAuthId;
    authProvider = 'google';

    const { data: existingProfile } = await admin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      return json(400, { error: 'Este e-mail ja possui conta completa no sistema.' });
    }

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

  // 7. Criar user_environments para cada ambiente solicitado
  const envRows = environments.map(env => ({
    user_id: userId,
    environment: env,
    role: role === 'sharks_team' ? 'team' as const : 'client' as const,
  }));

  const { error: envErr } = await admin
    .from('user_environments')
    .upsert(envRows, { onConflict: 'user_id,environment' });

  if (envErr) console.warn('[approve] user_environments warning:', envErr.message);

  // 8. Team permissions
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

  // 9. Memberships
  let membershipsWarning: string | null = null;

  if (role === 'client') {
    // Novos clientes criados na aprovação: { "sharks_company": "Nome", "estrategos": "Nome" }
    const newWorkspaces: Record<string, string> =
      (typeof body?.new_workspaces === 'object' && body.new_workspaces !== null) ? body.new_workspaces : {};

    // Workspace específico escolhido (validado pertencer a algum dos envs concedidos)
    if (clientWorkspaceId) {
      const { error: memErr } = await admin.from('memberships').upsert(
        { user_id: userId, workspace_id: clientWorkspaceId, role: 'member' },
        { onConflict: 'user_id,workspace_id' },
      );
      if (memErr) membershipsWarning = `Cliente: ${memErr.message}`;

      // Ambientes ADICIONAIS (sem workspace escolhido): garantir ao menos
      // um workspace em cada, criando default quando necessário
      const { data: chosenWs } = await admin
        .from('workspaces')
        .select('organization_id')
        .eq('id', clientWorkspaceId)
        .maybeSingle();
      const chosenOrg = chosenWs?.organization_id ?? null;
      const { data: orgs } = await admin.from('organizations').select('id, environment');
      const orgByEnv = new Map((orgs ?? []).map(o => [o.environment, o.id]));

      for (const env of environments) {
        const envOrg = orgByEnv.get(env);
        if (!envOrg || envOrg === chosenOrg) continue;

        const wsName = newWorkspaces[env]?.trim()
          || `${fullName} - ${env === 'sharks_company' ? 'Sharks' : 'Estrategos'}`;
        const slugBase = slugify(wsName) || `cliente-${Date.now()}`;
        const { data: newWs, error: wsErr } = await admin.from('workspaces').insert({
          organization_id: envOrg,
          name: wsName,
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
          is_active: true,
        }).select('id').maybeSingle();
        if (wsErr || !newWs) { console.warn(`[approve] ws creation (${env}):`, wsErr?.message); continue; }

        const { error: memErr2 } = await admin.from('memberships').upsert(
          { user_id: userId, workspace_id: newWs.id, role: 'member' },
          { onConflict: 'user_id,workspace_id' },
        );
        if (memErr2) membershipsWarning = `Cliente (${env}): ${memErr2.message}`;
      }
    } else {
      // Sem workspace escolhido: criar um workspace para cada ambiente solicitado
      // (nome customizado via new_workspaces[env] ou default)
      const { data: orgs } = await admin.from('organizations').select('id, environment');
      const orgByEnv = new Map((orgs ?? []).map(o => [o.environment, o.id]));

      for (const env of environments) {
        const orgId = orgByEnv.get(env);
        if (!orgId) continue;

        const wsName = newWorkspaces[env]?.trim()
          || `${fullName} - ${env === 'sharks_company' ? 'Sharks' : 'Estrategos'}`;
        const slugBase = slugify(wsName) || `cliente-${Date.now()}`;

        const { data: newWs, error: wsErr } = await admin.from('workspaces').insert({
          organization_id: orgId,
          name: wsName,
          slug: `${slugBase}-${Math.random().toString(36).slice(2, 6)}`,
          is_active: true,
        }).select('id').maybeSingle();

        if (wsErr || !newWs) {
          console.warn(`[approve] workspace creation warning (${env}):`, wsErr?.message);
          continue;
        }

        const { error: memErr } = await admin.from('memberships').upsert(
          { user_id: userId, workspace_id: newWs.id, role: 'member' },
          { onConflict: 'user_id,workspace_id' },
        );
        if (memErr) membershipsWarning = `Cliente (${env}): ${memErr.message}`;
      }
    }
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

  // 10. Mark approved
  const { error: updErr } = await admin
    .from('access_requests')
    .update({
      status: 'approved',
      granted_role: role,
      temp_password: tempPassword,
      auth_provider: authProvider === 'google' ? 'google' : null,
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
    .eq('id', request_id);

  if (updErr) console.warn('[approve] update warning:', updErr.message);

  // 11. E-mail transacional (best-effort — nunca bloqueia a aprovacao)
  let emailSent = false;
  try {
    const mail = approvedAccessEmail({
      name: fullName || reqRow.full_name || reqRow.email,
      roleLabel: role === 'sharks_team' ? 'Time Sharks' : 'Cliente',
      envLabels: environments.map(e => e === 'estrategos' ? 'Estrategos' : 'Sharks').join(', '),
      authProvider,
      tempPassword,
    });
    const mailResult = await sendEmail({ to: reqRow.email, subject: mail.subject, html: mail.html });
    emailSent = mailResult.ok;
  } catch (e) {
    console.warn('[approve] e-mail falhou:', (e as Error).message);
  }

  return json(200, {
    ok: true,
    user_id: userId,
    role,
    environments,
    auth_provider: authProvider,
    temp_password: tempPassword,
    email: reqRow.email,
    email_sent: emailSent,
    warning: membershipsWarning,
  });
});
