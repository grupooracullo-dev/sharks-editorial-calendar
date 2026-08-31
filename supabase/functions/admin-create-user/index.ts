import { serviceClient, corsHeaders } from '../_shared/google.ts';
import { sendEmail, welcomeEmail } from '../_shared/email.ts';

// Per-request CORS (updated at handler start)
let CORS: Record<string, string> = {};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const VALID_ROLES = ['admin_sharks', 'sharks_team'];
const VALID_ENVS = ['sharks_company', 'estrategos'];
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
  CORS = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Token ausente' });

  const admin = serviceClient();
  const token = authHeader.replace(/^Bearer /i, '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json(401, { error: 'Token invalido' });

  const { data: caller } = await admin.from('users').select('role, is_guardian').eq('id', userData.user.id).maybeSingle();
  const guardian = !!caller?.is_guardian || caller?.role === 'oracullo_admin';

  const body = await req.json().catch(() => null);
  if (!body) return json(400, { error: 'JSON invalido' });

  const { email, password, full_name, role, permissions, workspace_ids } = body;
  const environment: string = VALID_ENVS.includes(body?.environment) ? body.environment : 'sharks_company';

  // Gate POR AMBIENTE: guardiao OU admin global sharks (so para sharks_company)
  // OU admin do ambiente-alvo (user_environments.role = 'admin').
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
    return json(403, { error: `Apenas guardiao ou admin do ambiente ${environment} pode criar usuarios nele` });
  }

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

  // Workspaces precisam pertencer a org do ambiente (evita cross-env)
  if (Array.isArray(workspace_ids) && workspace_ids.length > 0) {
    const { data: org } = await admin.from('organizations').select('id').eq('environment', environment).maybeSingle();
    const { data: envWs } = await admin
      .from('workspaces')
      .select('id')
      .eq('organization_id', org?.id ?? '00000000-0000-0000-0000-000000000000');
    const validIds = new Set((envWs ?? []).map((w: { id: string }) => w.id));
    const invalid = workspace_ids.filter((id: string) => !validIds.has(id));
    if (invalid.length > 0) {
      return json(400, { error: `Um ou mais clientes nao pertencem ao ambiente ${environment}` });
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

  // 2.1 Acesso ao ambiente (user_environments) — sem isso o usuario
  //     nasce sem acesso a qualquer ambiente e fica travado no login.
  const envRole: 'admin' | 'team' =
    environment === 'estrategos'
      ? (body?.env_role === 'admin' ? 'admin' : 'team')
      : (role === 'admin_sharks' ? 'admin' : 'team');
  const { error: envError } = await admin
    .from('user_environments')
    .upsert(
      { user_id: authUser.user.id, environment, role: envRole, granted_by: userData.user.id },
      { onConflict: 'user_id,environment' },
    );
  if (envError) {
    await admin.from('users').delete().eq('id', authUser.user.id).catch(() => {});
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    return json(500, { error: `Ambiente: ${envError.message}` });
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

  // 5. E-mail de boas-vindas (best-effort — nunca bloqueia a criacao)
  let emailSent = false;
  try {
    const mail = welcomeEmail({
      name: full_name,
      roleLabel: role === 'admin_sharks'
        ? 'Administrador'
        : environment === 'estrategos' ? 'Time Estrategos' : 'Time Sharks',
      password: String(password),
    });
    const mailResult = await sendEmail({ to: String(email).trim().toLowerCase(), subject: mail.subject, html: mail.html });
    emailSent = mailResult.ok;
  } catch (e) {
    console.warn('[create-user] e-mail falhou:', (e as Error).message);
  }

  return json(200, { ok: true, user_id: authUser.user.id, email_sent: emailSent, warning: membershipsWarning });
});
