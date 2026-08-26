import { serviceClient, corsHeaders } from '../_shared/google.ts';

const CORS: Record<string, string> = {};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // 2. Does an auth user already exist for this email?
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

    // Pull the name from Google metadata when the form name is empty
    const fullName = (reqRow.full_name || '').trim()
      || (await admin.auth.admin.getUserById(userId)).data?.user?.user_metadata?.full_name
      || reqRow.email;

    const { error: profileErr } = await admin.from('users').insert({
      id: userId,
      email: reqRow.email,
      full_name: fullName,
      role: reqRow.requested_role,
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
      user_metadata: { full_name: reqRow.full_name, role: reqRow.requested_role },
    });
    if (createErr || !authUser?.user) {
      return json(500, { error: `Falha ao criar auth: ${createErr?.message}` });
    }
    userId = authUser.user.id;

    const { error: profileErr } = await admin.from('users').insert({
      id: userId,
      email: reqRow.email,
      full_name: reqRow.full_name,
      role: reqRow.requested_role,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json(500, { error: `Perfil: ${profileErr.message}` });
    }
  }

  // 3. Membership when a workspace was requested
  if (reqRow.workspace_id) {
    const { error: memErr } = await admin.from('memberships').upsert(
      { user_id: userId, workspace_id: reqRow.workspace_id, role: 'member' },
      { onConflict: 'user_id,workspace_id' }
    );
    if (memErr) console.warn('[approve] membership warning:', memErr.message);
  }

  // 4. Mark the request approved
  const { error: updErr } = await admin
    .from('access_requests')
    .update({
      status: 'approved',
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
    auth_provider: authProvider,
    temp_password: tempPassword,
    email: reqRow.email,
  });
});
